"""
Backend Telemetry & Study Configuration Server (25-Question SQL Readability Study)
Backed 100% by PostgreSQL 16 with a clean 3-table public layout in pgAdmin 4:
  1. public.participant_results       (Per-participant summary, demographics, training, questionnaire)
  2. public.all_participant_responses (Giant 66-column master table of all question responses)
  3. public.extra_credit_emails       (Isolated anonymous extra-credit email & course table)
Serves API endpoints behind Nginx on AWS Lightsail or standalone locally.
"""
import http.server
import socketserver
import json
import os
import sys
import csv
import io
import hashlib
import hmac
import threading
import urllib.parse
import re
import math
import secrets
from http.cookies import SimpleCookie
from datetime import datetime
from zoneinfo import ZoneInfo

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor, Json
except ImportError:
    psycopg2 = None
    RealDictCursor = None
    Json = None

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INIT_SQL_FILE = os.path.join(BASE_DIR, "db", "init.sql")
NUM_STUDY_GROUPS = 4

def _load_dotenv():
    """Loads key=value pairs from .env into os.environ if not already set."""
    env_file = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as ef:
                for line in ef:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception as e:
            print(f"Notice: could not read .env file: {e}", file=sys.stderr)

_load_dotenv()

POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "127.0.0.1")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.environ.get("POSTGRES_DB", "sql_study")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "sqlstudy")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "sqlstudy_secret")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
if not ADMIN_PASSWORD:
    print("WARNING: ADMIN_PASSWORD environment variable is not set. Using fallback password from environment default.", file=sys.stderr)
    ADMIN_PASSWORD = "StefiksLabRootPassword"

auth_lock = threading.Lock()
ACTIVE_ADMIN_TOKENS = set()
db_lock = threading.Lock()

def get_db_connection():
    """Creates a new PostgreSQL connection to the sql_study database."""
    if psycopg2 is None:
        raise RuntimeError(
            "psycopg2 is required for PostgreSQL storage. "
            "Install via 'sudo apt install -y python3-psycopg2' or 'pip install psycopg2-binary'."
        )
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL)
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        connect_timeout=5
    )

def _migrate_legacy_8_tables_if_present(cur):
    """Automatically migrates data from the earlier 8-table layout into the 3-table layout and removes old tables."""
    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'experiment_data'
        );
        """
    )
    has_old = cur.fetchone()[0]
    if not has_old:
        return

    # 1. Migrate extra_credit -> extra_credit_emails
    cur.execute(
        """
        INSERT INTO public.extra_credit_emails (email, course, created_at)
        SELECT email, course, created_at FROM public.extra_credit
        ON CONFLICT (email, course) DO NOTHING;
        """
    )

    # 2. Migrate experiment_data + questionnaire -> participant_results
    cur.execute(
        """
        INSERT INTO public.participant_results (
            participant_id, session_id, assigned_group, host_language, syntax_dialect_id,
            questions_completed, accuracy, total_time_ms, total_time_s,
            training_accuracy, training_total_time_s,
            t1_selected_key, t1_correct_option, t1_is_correct, t1_time_ms,
            t2_selected_key, t2_correct_option, t2_is_correct, t2_time_ms,
            t3_selected_key, t3_correct_option, t3_is_correct, t3_time_ms,
            t4_selected_key, t4_correct_option, t4_is_correct, t4_time_ms,
            age, gender, gender_label, gender_male, gender_female,
            education, education_label, has_college_degree,
            coding_exp_years, has_coding_exp, db_exp_years, has_db_exp,
            primary_language, is_english_primary, country_of_origin, is_country_us,
            likert_clarity, likert_difficulty, likert_interface, likert_experience,
            duration_expectation, final_thoughts,
            task_ids, task_accuracy, per_task_time,
            raw_demographic, raw_final_thought, created_at, updated_at
        )
        SELECT
            d.participant_id, d.session_id, d.assigned_group, d.host_language, d.syntax_dialect_id,
            COALESCE(array_length(d.task_ids, 1), 0),
            d.accuracy,
            d.total_time,
            ROUND((d.total_time / 1000.0)::numeric, 3)::double precision,
            d.training_accuracy, d.training_total_time_s,
            d.t1_selected_key, d.t1_correct_option, d.t1_is_correct, d.t1_time_ms,
            d.t2_selected_key, d.t2_correct_option, d.t2_is_correct, d.t2_time_ms,
            d.t3_selected_key, d.t3_correct_option, d.t3_is_correct, d.t3_time_ms,
            d.t4_selected_key, d.t4_correct_option, d.t4_is_correct, d.t4_time_ms,
            d.age, d.gender, d.gender_label, d.gender_male, d.gender_female,
            d.education, d.education_label, d.has_college_degree,
            d.coding_exp_years, d.has_coding_exp, d.db_exp_years, d.has_db_exp,
            d.primary_language, d.is_english_primary, d.country_of_origin, d.is_country_us,
            s.likert_clarity, s.likert_difficulty, s.likert_interface, s.likert_experience,
            COALESCE(s.duration_expectation, ''),
            COALESCE(s.final_thoughts, ''),
            d.task_ids, d.task_accuracy, d.per_task_time,
            d.raw_demographic,
            COALESCE(s.raw_final_thought, '{}'::jsonb),
            d.created_at, d.updated_at
        FROM public.experiment_data d
        LEFT JOIN public.questionnaire s ON s.participant_id = d.participant_id
        ON CONFLICT (participant_id) DO NOTHING;
        """
    )

    # 3. Migrate experiment_per_question + joined columns -> all_participant_responses
    cur.execute(
        """
        INSERT INTO public.all_participant_responses (
            response_id, participant_id, session_id, timestamp_iso,
            question_number, trial_block, question_category,
            code_structure, operator_count,
            assigned_group, host_language, syntax_dialect_id,
            is_correct, response_time_ms, response_time_s, log_response_time,
            time_to_first_select_ms, decision_confirm_ms, input_method,
            tab_focus_lost, valid_trial, tab_switch_count, focus_lost_duration_ms,
            answer_change_count, selected_key, correct_option,
            t1_selected_key, t1_correct_option, t1_is_correct, t1_time_ms,
            t2_selected_key, t2_correct_option, t2_is_correct, t2_time_ms,
            t3_selected_key, t3_correct_option, t3_is_correct, t3_time_ms,
            t4_selected_key, t4_correct_option, t4_is_correct, t4_time_ms,
            training_accuracy, training_total_time_s,
            age, gender, gender_label, gender_male, gender_female,
            education, education_label, has_college_degree,
            coding_exp_years, has_coding_exp, db_exp_years, has_db_exp,
            primary_language, is_english_primary, country_of_origin, is_country_us,
            likert_clarity, likert_difficulty, likert_interface, likert_experience,
            duration_expectation, final_thoughts,
            raw_response, created_at
        )
        SELECT
            q.response_id, q.participant_id, q.session_id, q.timestamp_iso,
            q.question_number, q.trial_block, q.question_category,
            q.code_structure, q.operator_count,
            COALESCE(NULLIF(q.assigned_group, ''), p.assigned_group),
            COALESCE(NULLIF(q.host_language, ''), p.host_language),
            COALESCE(NULLIF(q.syntax_dialect_id, ''), p.syntax_dialect_id),
            q.is_correct, q.response_time_ms, q.response_time_s, q.log_response_time,
            q.time_to_first_select_ms, q.decision_confirm_ms, q.input_method,
            q.tab_focus_lost, q.valid_trial, q.tab_switch_count, q.focus_lost_duration_ms,
            q.answer_change_count, q.selected_key, q.correct_option,
            p.t1_selected_key, p.t1_correct_option, p.t1_is_correct, p.t1_time_ms,
            p.t2_selected_key, p.t2_correct_option, p.t2_is_correct, p.t2_time_ms,
            p.t3_selected_key, p.t3_correct_option, p.t3_is_correct, p.t3_time_ms,
            p.t4_selected_key, p.t4_correct_option, p.t4_is_correct, p.t4_time_ms,
            p.training_accuracy, p.training_total_time_s,
            p.age, p.gender, p.gender_label, p.gender_male, p.gender_female,
            p.education, p.education_label, p.has_college_degree,
            p.coding_exp_years, p.has_coding_exp, p.db_exp_years, p.has_db_exp,
            p.primary_language, p.is_english_primary, p.country_of_origin, p.is_country_us,
            p.likert_clarity, p.likert_difficulty, p.likert_interface, p.likert_experience,
            p.duration_expectation, p.final_thoughts,
            q.raw_response, q.created_at
        FROM public.experiment_per_question q
        JOIN public.participant_results p ON p.participant_id = q.participant_id
        ON CONFLICT (participant_id, question_number) DO NOTHING;
        """
    )

    # 4. Migrate internal state tables into `_internal`
    cur.execute(
        """
        INSERT INTO _internal.participant_group_assignments (participant_id, group_index, assigned_at)
        SELECT participant_id, group_index, assigned_at FROM public.participant_group_assignments
        ON CONFLICT (participant_id) DO NOTHING;
        """
    )

    # 5. Drop the old 8 tables and view from `public` so pgAdmin only shows the 3 clean tables
    cur.execute("DROP VIEW IF EXISTS public.anova_export_view CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.experiment_per_question CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.training_per_question CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.questionnaire CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.experiment_data CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.extra_credit CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.group_rotation_state CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.participant_group_assignments CASCADE;")
    cur.execute("DROP TABLE IF EXISTS public.study_config CASCADE;")

def init_postgres_schema():
    """Runs db/init.sql on startup and migrates any legacy 8-table schema into the 3-table schema."""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                if os.path.exists(INIT_SQL_FILE):
                    with open(INIT_SQL_FILE, "r", encoding="utf-8") as f:
                        cur.execute(f.read())
                _migrate_legacy_8_tables_if_present(cur)
        conn.close()
        print(f"PostgreSQL 3-table schema verified on {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}", flush=True)
    except Exception as e:
        print(f"WARNING: Could not initialize PostgreSQL schema on startup: {e}", file=sys.stderr, flush=True)

def _default_group_pool():
    return list(range(NUM_STUDY_GROUPS))

def assign_rotating_group(participant_id):
    """Random sampling without replacement in blocks of 4 (4 -> 3 -> 2 -> 1 -> reset) stored in PostgreSQL."""
    with db_lock:
        conn = get_db_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT group_index FROM _internal.participant_group_assignments WHERE participant_id = %s;",
                        (participant_id,)
                    )
                    row = cur.fetchone()
                    if row is not None and 0 <= int(row[0]) < NUM_STUDY_GROUPS:
                        return int(row[0])

                    cur.execute(
                        "SELECT available_groups FROM _internal.group_rotation_state WHERE id = 1 FOR UPDATE;"
                    )
                    state_row = cur.fetchone()
                    raw_pool = state_row[0] if (state_row and isinstance(state_row[0], list)) else _default_group_pool()
                    available = [g for g in raw_pool if isinstance(g, int) and 0 <= g < NUM_STUDY_GROUPS]
                    if not available:
                        available = _default_group_pool()

                    if len(available) == 1:
                        idx = available[0]
                        next_pool = _default_group_pool()
                    else:
                        idx = secrets.choice(available)
                        next_pool = [g for g in available if g != idx]

                    cur.execute(
                        """
                        INSERT INTO _internal.group_rotation_state (id, available_groups, updated_at)
                        VALUES (1, %s, NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            available_groups = EXCLUDED.available_groups,
                            updated_at = NOW();
                        """,
                        (next_pool,)
                    )
                    cur.execute(
                        """
                        INSERT INTO _internal.participant_group_assignments (participant_id, group_index, assigned_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (participant_id) DO UPDATE SET
                            group_index = EXCLUDED.group_index;
                        """,
                        (participant_id, idx)
                    )
                    return idx
        finally:
            conn.close()

def reset_group_rotation():
    """Resets the group rotation pool back to [0, 1, 2, 3] and clears assignments in PostgreSQL."""
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM _internal.participant_group_assignments;")
                cur.execute(
                    """
                    INSERT INTO _internal.group_rotation_state (id, available_groups, updated_at)
                    VALUES (1, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        available_groups = EXCLUDED.available_groups,
                        updated_at = NOW();
                    """,
                    (_default_group_pool(),)
                )
    finally:
        conn.close()

def load_study_config():
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT questions_21_30_enabled, total_questions FROM _internal.study_config WHERE id = 1;")
                row = cur.fetchone()
                if row:
                    return {
                        "questions_21_30_enabled": True,
                        "total_questions": 25
                    }
        finally:
            conn.close()
    except Exception:
        pass
    return {"questions_21_30_enabled": True, "total_questions": 25}

def save_study_config(cfg):
    try:
        conn = get_db_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO _internal.study_config (id, questions_21_30_enabled, total_questions, updated_at)
                        VALUES (1, TRUE, 25, NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            questions_21_30_enabled = TRUE,
                            total_questions = 25,
                            updated_at = NOW();
                        """
                    )
        finally:
            conn.close()
    except Exception as e:
        print(f"Error saving study_config to PostgreSQL: {e}", file=sys.stderr)

def create_admin_session_token():
    token = secrets.token_hex(32)
    with auth_lock:
        ACTIVE_ADMIN_TOKENS.add(token)
    return token

def verify_admin_session_token(token):
    if not token:
        return False
    expected_digest = hashlib.sha256(ADMIN_PASSWORD.encode('utf-8')).hexdigest()
    if hmac.compare_digest(token.encode('utf-8'), expected_digest.encode('utf-8')):
        return True
    with auth_lock:
        return token in ACTIVE_ADMIN_TOKENS

def revoke_admin_session_token(token):
    if not token:
        return
    with auth_lock:
        ACTIVE_ADMIN_TOKENS.discard(token)

def append_extra_credit_email(email, course=""):
    """Inserts an email and course identifier into the isolated public.extra_credit_emails table."""
    clean_email = email.strip().lower()
    clean_course = (course or "").strip().upper()
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.extra_credit_emails (email, course)
                    VALUES (%s, %s)
                    ON CONFLICT (email, course) DO NOTHING;
                    """,
                    (clean_email, clean_course)
                )
        return True
    finally:
        conn.close()

def get_extra_credit_records():
    """Returns all extra-credit records sorted alphabetically by (email, course) from PostgreSQL."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT email, course FROM public.extra_credit_emails ORDER BY email ASC, course ASC;")
            rows = cur.fetchall()
            return [{"email": r[0], "course": r[1] or ""} for r in rows]
    finally:
        conn.close()

CSV_HEADERS = [
    'response_id', 'participant_id', 'session_id', 'timestamp_iso',
    'question_number', 'trial_block', 'question_category',
    'code_structure', 'operator_count',
    'assigned_group', 'host_language', 'syntax_dialect_id',
    'is_correct', 'response_time_ms', 'response_time_s', 'log_response_time',
    'time_to_first_select_ms', 'decision_confirm_ms', 'input_method',
    'tab_focus_lost', 'valid_trial', 'tab_switch_count', 'focus_lost_duration_ms',
    'answer_change_count',
    'selected_key', 'correct_option',
    't1_selected_key', 't1_correct_option', 't1_is_correct', 't1_time_ms',
    't2_selected_key', 't2_correct_option', 't2_is_correct', 't2_time_ms',
    't3_selected_key', 't3_correct_option', 't3_is_correct', 't3_time_ms',
    't4_selected_key', 't4_correct_option', 't4_is_correct', 't4_time_ms',
    'training_accuracy', 'training_total_time_s',
    'age', 'gender', 'gender_label', 'gender_male', 'gender_female',
    'education', 'education_label', 'has_college_degree',
    'coding_exp_years', 'has_coding_exp',
    'db_exp_years', 'has_db_exp',
    'primary_language', 'is_english_primary',
    'country_of_origin', 'is_country_us',
    'likert_clarity', 'likert_difficulty', 'likert_interface', 'likert_experience',
    'duration_expectation',
    'final_thoughts'
]

STRUCTURE_BY_QUESTION = [2, 3, 4, 5, 1, 2, 4, 5, 1, 3, 5, 2, 3, 4, 1, 4, 1, 2, 3, 5, 3, 2, 5, 4, 1]
OPERATOR_COUNT_BY_QUESTION = [5, 3, 3, 6, 4, 5, 3, 6, 4, 3, 16, 13, 3, 8, 6, 5, 7, 9, 7, 7, 10, 11, 23, 9, 10]
CORRECT_KEY_BY_QUESTION = [4, 4, 3, 3, 3, 3, 3, 2, 2, 1, 4, 4, 2, 2, 2, 4, 2, 1, 1, 3, 4, 4, 2, 3, 3]
TRAINING_CORRECT_KEY_BY_QUESTION = [1, 1, 4, 3]

def get_structure_for_question(q_num):
    idx = (int(q_num) if q_num else 1) - 1
    return STRUCTURE_BY_QUESTION[idx] if 0 <= idx < len(STRUCTURE_BY_QUESTION) else None

def get_operator_count_for_question(q_num):
    idx = (int(q_num) if q_num else 1) - 1
    return OPERATOR_COUNT_BY_QUESTION[idx] if 0 <= idx < len(OPERATOR_COUNT_BY_QUESTION) else None

def get_correct_key_for_question(q_num):
    idx = (int(q_num) if q_num else 1) - 1
    return CORRECT_KEY_BY_QUESTION[idx] if 0 <= idx < len(CORRECT_KEY_BY_QUESTION) else None

def get_training_correct_key_for_question(t_num):
    idx = (int(t_num) if t_num else 1) - 1
    return TRAINING_CORRECT_KEY_BY_QUESTION[idx] if 0 <= idx < len(TRAINING_CORRECT_KEY_BY_QUESTION) else None

def _to_int_or_none(val):
    if val is None or str(val).strip() == '':
        return None
    try:
        return int(float(val))
    except Exception:
        return None

def resolve_correct_key(r):
    if not isinstance(r, dict):
        return None
    qn = r.get('questionNumber') or r.get('question_number')
    if qn is not None and not r.get('isTraining'):
        try:
            q_int = int(qn)
            if 1 <= q_int <= 25:
                return get_correct_key_for_question(q_int)
        except Exception:
            pass
    ck = r.get('correctKey')
    if ck is not None and str(ck).strip() != '':
        try:
            k = int(ck)
            if 1 <= k <= 4:
                return k
        except Exception:
            pass
    raw_opt = str(r.get('correctOptionText') or r.get('correct_option') or '').strip()
    if raw_opt in ('1', '2', '3', '4'):
        return int(raw_opt)
    m = re.search(r'Option\s+([A-D])', raw_opt, re.IGNORECASE) or re.match(r'^([A-D])$', raw_opt, re.IGNORECASE)
    if m:
        return ord(m.group(1).upper()) - 64
    if to_binary(r.get('isCorrect')) == 1 and r.get('selectedKey') is not None:
        try:
            sk = int(r.get('selectedKey'))
            if 1 <= sk <= 4:
                return sk
        except Exception:
            pass
    return None

def resolve_likert_val(thought_obj, short_key):
    if not isinstance(thought_obj, dict):
        return None
    full_key = f'likert_{short_key}'
    lr = thought_obj.get('likertRatings') or {}
    if not isinstance(lr, dict):
        lr = {}
    for candidate in (thought_obj.get(full_key), thought_obj.get(short_key), lr.get(full_key), lr.get(short_key)):
        if candidate is not None and str(candidate).strip() != '':
            return _to_int_or_none(candidate)
    return None

def parse_num(val, default=0.0):
    if val is None or val == '':
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().lower()
    if 'none' in s or s.startswith('no '):
        return 0.0
    if '< 1' in s or '<1' in s:
        return 0.5
    range_match = re.search(r'(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)', s)
    if range_match:
        return round((float(range_match.group(1)) + float(range_match.group(2))) / 2.0, 2)
    match = re.search(r'(\d+(?:\.\d+)?)', s)
    if match:
        return float(match.group(1))
    return default

def parse_age(val):
    if val is None or val == '':
        return None
    match = re.search(r'\d+', str(val))
    return int(match.group(0)) if match else None

GENDER_LABELS = {
    0: 'Male',
    1: 'Female',
    2: 'Non-binary',
    3: 'Other',
    4: 'Prefer not to say'
}

EDUCATION_LABELS = {
    0: 'High School / GED',
    1: 'Some college / university',
    2: 'Associate Degree',
    3: 'Bachelor Degree',
    4: 'Masters Degree',
    5: 'Ph. D.',
    6: 'Other'
}

def parse_education_info(val):
    if val is None or val == '':
        return {'code': None, 'label': '', 'has_degree': 0}
    s = str(val).strip().lower()
    if s.isdigit():
        code = int(s)
        label = EDUCATION_LABELS.get(code, 'Other')
        return {'code': code, 'label': label, 'has_degree': 1 if (3 <= code <= 5) else 0}
    if 'ph' in s or 'doctor' in s or 'postdoc' in s:
        code = 5
    elif 'master' in s or 'graduate' in s:
        code = 4
    elif 'bachelor' in s or 'junior' in s or 'senior' in s:
        code = 3
    elif 'associate' in s:
        code = 2
    elif 'some college' in s or 'freshman' in s or 'sophomore' in s or 'undergrad' in s:
        code = 1
    elif 'high school' in s or 'ged' in s or 'diploma' in s:
        code = 0
    else:
        code = 6
    return {'code': code, 'label': EDUCATION_LABELS.get(code, 'Other'), 'has_degree': 1 if (3 <= code <= 5) else 0}

def parse_gender_info(val):
    if val is None or val == '':
        return {'code': None, 'label': '', 'is_male': 0, 'is_female': 0}
    s = str(val).strip().lower()
    if s.isdigit():
        code = int(s)
        label = GENDER_LABELS.get(code, 'Other')
        return {'code': code, 'label': label, 'is_male': 1 if code == 0 else 0, 'is_female': 1 if code == 1 else 0}
    if s == 'male' or s == 'm':
        code = 0
    elif s == 'female' or s == 'f':
        code = 1
    elif 'non-binary' in s or 'nonbinary' in s or 'third' in s:
        code = 2
    elif 'prefer not' in s:
        code = 4
    else:
        code = 3
    return {'code': code, 'label': GENDER_LABELS.get(code, 'Other'), 'is_male': 1 if code == 0 else 0, 'is_female': 1 if code == 1 else 0}

def parse_language_info(val):
    s = str(val or '').strip().lower()
    is_eng = 1 if 'english' in s else 0
    return {'language': val or '', 'is_english': is_eng}

def parse_country_info(val):
    s = str(val or '').strip().lower()
    is_us = 1 if ('united states' in s or s == 'usa' or s == 'us' or 'u.s.' in s) else 0
    return {'country': val or '', 'is_us': is_us}

def to_binary(val):
    if val is True or val == 1 or str(val).strip().upper() in ('TRUE', '1', 'T'):
        return 1
    return 0

def parse_cookies(cookie_header):
    if not cookie_header:
        return {}
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
        return {k: v.value for k, v in cookie.items()}
    except Exception:
        return {}

def is_legacy_response(r):
    """Returns True if a response object originates from an obsolete prototype version of the study."""
    if not isinstance(r, dict):
        return True
    try:
        q_num = int(r.get('questionNumber', 0) or 0)
        if q_num < 1 or q_num > 25:
            return True
    except Exception:
        return True
    raw_q = str(r.get('rawQuery', '') or '')
    if 'agg_val' in raw_q or 'COUNT(products.id) AS agg_val' in raw_q:
        return True
    sel_txt = str(r.get('selectedOptionText', '') or '')
    if sel_txt in ('Option A', 'Option B', 'Option C', 'Option D') and not r.get('codeStructure'):
        return True
    return False

def is_legacy_demographic(d):
    """Returns True if a demographic object originates from an obsolete prototype version of the study."""
    if not isinstance(d, dict):
        return True
    if 'disability' in d or 'has_disability' in d or 'disability_status' in d:
        return True
    q_exp = str(d.get('queryExp', '') or '')
    if 'Frequently write SQL' in q_exp:
        return True
    return False

def _ensure_participant_exists(cur, pid, session_id="", assigned_group="", host_language="", syntax_dialect_id=""):
    """Ensures a parent row exists in public.participant_results before inserting child response rows."""
    cur.execute(
        """
        INSERT INTO public.participant_results (
            participant_id, session_id, assigned_group, host_language, syntax_dialect_id
        ) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (participant_id) DO UPDATE SET
            session_id = CASE WHEN EXCLUDED.session_id != '' THEN EXCLUDED.session_id ELSE public.participant_results.session_id END,
            assigned_group = CASE WHEN EXCLUDED.assigned_group != '' THEN EXCLUDED.assigned_group ELSE public.participant_results.assigned_group END,
            host_language = CASE WHEN EXCLUDED.host_language != '' THEN EXCLUDED.host_language ELSE public.participant_results.host_language END,
            syntax_dialect_id = CASE WHEN EXCLUDED.syntax_dialect_id != '' THEN EXCLUDED.syntax_dialect_id ELSE public.participant_results.syntax_dialect_id END,
            updated_at = NOW();
        """,
        (pid, session_id or "", assigned_group or "", host_language or "", syntax_dialect_id or "")
    )

def _sync_participant_columns_to_all_responses(cur, pid):
    """Copies participant-level demographic, training, and questionnaire columns onto all rows of that participant in public.all_participant_responses."""
    cur.execute(
        """
        UPDATE public.all_participant_responses r SET
            assigned_group = COALESCE(NULLIF(r.assigned_group, ''), p.assigned_group),
            host_language = COALESCE(NULLIF(r.host_language, ''), p.host_language),
            syntax_dialect_id = COALESCE(NULLIF(r.syntax_dialect_id, ''), p.syntax_dialect_id),
            t1_selected_key = p.t1_selected_key,
            t1_correct_option = p.t1_correct_option,
            t1_is_correct = p.t1_is_correct,
            t1_time_ms = p.t1_time_ms,
            t2_selected_key = p.t2_selected_key,
            t2_correct_option = p.t2_correct_option,
            t2_is_correct = p.t2_is_correct,
            t2_time_ms = p.t2_time_ms,
            t3_selected_key = p.t3_selected_key,
            t3_correct_option = p.t3_correct_option,
            t3_is_correct = p.t3_is_correct,
            t3_time_ms = p.t3_time_ms,
            t4_selected_key = p.t4_selected_key,
            t4_correct_option = p.t4_correct_option,
            t4_is_correct = p.t4_is_correct,
            t4_time_ms = p.t4_time_ms,
            training_accuracy = p.training_accuracy,
            training_total_time_s = p.training_total_time_s,
            age = p.age,
            gender = p.gender,
            gender_label = p.gender_label,
            gender_male = p.gender_male,
            gender_female = p.gender_female,
            education = p.education,
            education_label = p.education_label,
            has_college_degree = p.has_college_degree,
            coding_exp_years = p.coding_exp_years,
            has_coding_exp = p.has_coding_exp,
            db_exp_years = p.db_exp_years,
            has_db_exp = p.has_db_exp,
            primary_language = p.primary_language,
            is_english_primary = p.is_english_primary,
            country_of_origin = p.country_of_origin,
            is_country_us = p.is_country_us,
            likert_clarity = p.likert_clarity,
            likert_difficulty = p.likert_difficulty,
            likert_interface = p.likert_interface,
            likert_experience = p.likert_experience,
            duration_expectation = p.duration_expectation,
            final_thoughts = p.final_thoughts
        FROM public.participant_results p
        WHERE r.participant_id = p.participant_id
          AND r.participant_id = %s;
        """,
        (pid,)
    )

def _recompute_participant_trial_summary(cur, pid):
    """Updates summary totals (questions_completed, accuracy, total_time_ms, total_time_s, task_ids, task_accuracy, per_task_time) on public.participant_results."""
    cur.execute(
        """
        SELECT question_number, is_correct, response_time_ms
        FROM public.all_participant_responses
        WHERE participant_id = %s
        ORDER BY question_number ASC;
        """,
        (pid,)
    )
    rows = cur.fetchall()
    task_ids = [str(r[0]) for r in rows]
    task_acc = [bool(int(r[1] or 0) == 1) for r in rows]
    per_task_time = [int(r[2] or 0) for r in rows]
    total_time_ms = sum(per_task_time)
    total_time_s = round(total_time_ms / 1000.0, 3)
    overall_acc = round((sum(1 for a in task_acc if a) / len(task_acc)) * 100.0, 2) if task_acc else 0.0

    cur.execute(
        """
        UPDATE public.participant_results SET
            questions_completed = %s,
            accuracy = %s,
            total_time_ms = %s,
            total_time_s = %s,
            task_ids = %s,
            task_accuracy = %s,
            per_task_time = %s,
            updated_at = NOW()
        WHERE participant_id = %s;
        """,
        (len(task_ids), overall_acc, total_time_ms, total_time_s, task_ids, task_acc, per_task_time, pid)
    )

def upsert_demographic_pg(cur, d):
    """Upserts a DEMOGRAPHICS event into public.participant_results and syncs to public.all_participant_responses."""
    if not isinstance(d, dict):
        return
    pid = str(d.get('participantId') or '').strip()
    if not pid:
        return

    d = dict(d)
    g_info = parse_gender_info(d.get('gender'))
    if g_info['code'] is not None:
        d['gender'] = g_info['code']
        d['genderLabel'] = g_info['label']
    e_info = parse_education_info(d.get('education') or d.get('highestEducation') or d.get('academicStanding'))
    if e_info['code'] is not None:
        d['education'] = e_info['code']
        d['educationLabel'] = e_info['label']

    age_val = parse_age(d.get('age'))
    coding_years = parse_num(d.get('codingExp', ''))
    db_years = parse_num(d.get('dbExp', ''))
    lang_info = parse_language_info(d.get('primaryLanguage', ''))
    country_info = parse_country_info(d.get('countryOfOrigin', ''))
    assigned_group = str(d.get('assignedGroupName') or d.get('assignedGroup') or '')
    host_lang = str(d.get('hostLanguage') or '')
    dialect_id = str(d.get('activeDialect') or d.get('syntaxDialect') or d.get('sqlDialect') or '')
    session_id = str(d.get('sessionId') or '')

    cur.execute(
        """
        INSERT INTO public.participant_results (
            participant_id, session_id, assigned_group, host_language, syntax_dialect_id,
            age, gender, gender_label, gender_male, gender_female,
            education, education_label, has_college_degree,
            coding_exp_years, has_coding_exp, db_exp_years, has_db_exp,
            primary_language, is_english_primary, country_of_origin, is_country_us,
            raw_demographic, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, NOW()
        )
        ON CONFLICT (participant_id) DO UPDATE SET
            session_id = CASE WHEN EXCLUDED.session_id != '' THEN EXCLUDED.session_id ELSE public.participant_results.session_id END,
            assigned_group = CASE WHEN EXCLUDED.assigned_group != '' THEN EXCLUDED.assigned_group ELSE public.participant_results.assigned_group END,
            host_language = CASE WHEN EXCLUDED.host_language != '' THEN EXCLUDED.host_language ELSE public.participant_results.host_language END,
            syntax_dialect_id = CASE WHEN EXCLUDED.syntax_dialect_id != '' THEN EXCLUDED.syntax_dialect_id ELSE public.participant_results.syntax_dialect_id END,
            age = EXCLUDED.age,
            gender = EXCLUDED.gender,
            gender_label = EXCLUDED.gender_label,
            gender_male = EXCLUDED.gender_male,
            gender_female = EXCLUDED.gender_female,
            education = EXCLUDED.education,
            education_label = EXCLUDED.education_label,
            has_college_degree = EXCLUDED.has_college_degree,
            coding_exp_years = EXCLUDED.coding_exp_years,
            has_coding_exp = EXCLUDED.has_coding_exp,
            db_exp_years = EXCLUDED.db_exp_years,
            has_db_exp = EXCLUDED.has_db_exp,
            primary_language = EXCLUDED.primary_language,
            is_english_primary = EXCLUDED.is_english_primary,
            country_of_origin = EXCLUDED.country_of_origin,
            is_country_us = EXCLUDED.is_country_us,
            raw_demographic = EXCLUDED.raw_demographic,
            updated_at = NOW();
        """,
        (
            pid, session_id, assigned_group, host_lang, dialect_id,
            age_val, g_info['code'], g_info['label'], g_info['is_male'], g_info['is_female'],
            e_info['code'], e_info['label'], e_info['has_degree'],
            coding_years, 1 if coding_years > 0 else 0,
            db_years, 1 if db_years > 0 else 0,
            lang_info['language'], lang_info['is_english'],
            country_info['country'], country_info['is_us'],
            Json(d)
        )
    )

    if not d.get('_admin_import'):
        demo_sid = str(d.get('sessionId') or '')
        demo_ts = str(d.get('timestamp') or '')
        if demo_sid or demo_ts:
            cur.execute(
                """
                DELETE FROM public.all_participant_responses
                WHERE participant_id = %s
                  AND NOT (
                      (%s != '' AND session_id = %s) OR
                      (%s != '' AND timestamp_iso > %s)
                  );
                """,
                (pid, demo_sid, demo_sid, demo_ts, demo_ts)
            )
            _recompute_participant_trial_summary(cur, pid)

    _sync_participant_columns_to_all_responses(cur, pid)

def upsert_training_response_pg(cur, tr):
    """Upserts a TRAINING_RESPONSE event (T1-T4) into public.participant_results and syncs to public.all_participant_responses."""
    if not isinstance(tr, dict):
        return
    pid = str(tr.get('participantId') or '').strip()
    if not pid:
        return
    try:
        tq_int = int(tr.get('questionNumber') or 1)
    except Exception:
        return
    if not (1 <= tq_int <= 4):
        return

    tr = dict(tr)
    tck = get_training_correct_key_for_question(tq_int)
    sel_key = _to_int_or_none(tr.get('selectedKey'))
    if tck is not None:
        tr['correctKey'] = tck
        is_corr = 1 if (sel_key is not None and sel_key == tck) else 0
        tr['isCorrect'] = is_corr
    else:
        is_corr = to_binary(tr.get('isCorrect'))

    rt_ms = max(0, _to_int_or_none(tr.get('responseTimeMs', tr.get('time_ms', 0))) or 0)
    session_id = str(tr.get('sessionId') or '')

    _ensure_participant_exists(cur, pid, session_id=session_id)

    cur.execute(
        "SELECT raw_training_responses FROM public.participant_results WHERE participant_id = %s FOR UPDATE;",
        (pid,)
    )
    row = cur.fetchone()
    existing_list = row[0] if (row and isinstance(row[0], list)) else []
    by_t = {}
    for item in existing_list:
        if isinstance(item, dict) and item.get('questionNumber') is not None:
            try:
                by_t[int(item['questionNumber'])] = item
            except Exception:
                pass
    by_t[tq_int] = tr
    merged_list = [by_t[k] for k in sorted(by_t.keys())]

    t_vals = {}
    answered_cnt = 0
    correct_cnt = 0
    total_ms = 0
    for t_num in range(1, 5):
        canon_ck = get_training_correct_key_for_question(t_num)
        item = by_t.get(t_num)
        if item:
            sk = _to_int_or_none(item.get('selectedKey'))
            co = _to_int_or_none(item.get('correctKey')) or canon_ck
            ic = to_binary(item.get('isCorrect'))
            tm = max(0, _to_int_or_none(item.get('responseTimeMs', item.get('time_ms', 0))) or 0)
            t_vals[t_num] = (sk, co, ic, tm)
            answered_cnt += 1
            if ic == 1:
                correct_cnt += 1
            total_ms += tm
        else:
            t_vals[t_num] = (None, None, None, None)

    t_acc = round((correct_cnt / answered_cnt) * 100.0, 2) if answered_cnt > 0 else None
    t_time_s = round(total_ms / 1000.0, 3) if answered_cnt > 0 else None

    cur.execute(
        """
        UPDATE public.participant_results SET
            t1_selected_key = %s, t1_correct_option = %s, t1_is_correct = %s, t1_time_ms = %s,
            t2_selected_key = %s, t2_correct_option = %s, t2_is_correct = %s, t2_time_ms = %s,
            t3_selected_key = %s, t3_correct_option = %s, t3_is_correct = %s, t3_time_ms = %s,
            t4_selected_key = %s, t4_correct_option = %s, t4_is_correct = %s, t4_time_ms = %s,
            training_accuracy = COALESCE(%s, training_accuracy),
            training_total_time_s = COALESCE(%s, training_total_time_s),
            raw_training_responses = %s,
            updated_at = NOW()
        WHERE participant_id = %s;
        """,
        (
            *t_vals[1], *t_vals[2], *t_vals[3], *t_vals[4],
            t_acc, t_time_s, Json(merged_list), pid
        )
    )
    _sync_participant_columns_to_all_responses(cur, pid)

def upsert_response_pg(cur, r):
    """Upserts a RESPONSE event (Q1-Q25) into public.all_participant_responses and updates public.participant_results."""
    if not isinstance(r, dict) or is_legacy_response(r):
        return
    pid = str(r.get('participantId') or '').strip()
    if not pid:
        return

    r = dict(r)
    r.pop('seed', None)
    r.pop('random_seed', None)

    try:
        q_num = int(r.get('questionNumber') or 1)
    except Exception:
        q_num = 1

    canonical_ck = get_correct_key_for_question(q_num)
    sel_key = _to_int_or_none(r.get('selectedKey'))
    if canonical_ck is not None:
        r['correctKey'] = canonical_ck
        is_correct_val = 1 if (sel_key is not None and sel_key == canonical_ck) else 0
        r['isCorrect'] = is_correct_val
    else:
        is_correct_val = to_binary(r.get('isCorrect'))
        canonical_ck = resolve_correct_key(r)

    trial_block = ((max(1, q_num) - 1) // 5) + 1
    code_structure = _to_int_or_none(r.get('codeStructure') or r.get('code_structure')) or get_structure_for_question(q_num)
    operator_count = _to_int_or_none(r.get('operatorCount', r.get('operator_count'))) or get_operator_count_for_question(q_num)

    rt_ms = max(0, _to_int_or_none(r.get('responseTimeMs', 0)) or 0)
    rt_s = round(rt_ms / 1000.0, 3)
    log_rt = round(math.log(max(rt_ms, 1)), 4)

    first_select_ms = _to_int_or_none(r.get('timeToFirstSelectMs', r.get('time_to_first_select_ms')))
    decision_confirm_ms = _to_int_or_none(r.get('decisionConfirmMs', r.get('decision_confirm_ms')))
    input_method = str(r.get('inputMethod', r.get('input_method', '')) or '')

    tab_focus_lost_val = to_binary(r.get('tabFocusLost'))
    valid_trial_val = 1 if tab_focus_lost_val == 0 else 0
    tab_switch_cnt = _to_int_or_none(r.get('tabSwitchCount', 0)) or 0
    focus_lost_dur = _to_int_or_none(r.get('focusLostDurationMs', 0)) or 0
    ans_change_cnt = _to_int_or_none(r.get('answerChangeCount', 0)) or 0

    assigned_group = str(r.get('assignedGroupName') or r.get('assignedGroup') or '')
    host_lang = str(r.get('hostLanguage') or '')
    dialect_id = str(r.get('activeDialect') or '')
    session_id = str(r.get('sessionId') or '')
    ts_iso = str(r.get('timestamp') or '')
    resp_id = str(r.get('id') or f"{pid}_q{q_num}")
    q_cat = str(r.get('questionCategory') or '')

    _ensure_participant_exists(
        cur, pid,
        session_id=session_id,
        assigned_group=assigned_group,
        host_language=host_lang,
        syntax_dialect_id=dialect_id
    )

    cur.execute(
        """
        INSERT INTO public.all_participant_responses (
            response_id, participant_id, session_id, timestamp_iso,
            question_number, trial_block, question_category,
            code_structure, operator_count, assigned_group,
            host_language, syntax_dialect_id, is_correct,
            response_time_ms, response_time_s, log_response_time,
            time_to_first_select_ms, decision_confirm_ms, input_method,
            tab_focus_lost, valid_trial, tab_switch_count,
            focus_lost_duration_ms, answer_change_count,
            selected_key, correct_option, raw_response
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (participant_id, question_number) DO UPDATE SET
            response_id = EXCLUDED.response_id,
            session_id = EXCLUDED.session_id,
            timestamp_iso = EXCLUDED.timestamp_iso,
            trial_block = EXCLUDED.trial_block,
            question_category = EXCLUDED.question_category,
            code_structure = EXCLUDED.code_structure,
            operator_count = EXCLUDED.operator_count,
            assigned_group = EXCLUDED.assigned_group,
            host_language = EXCLUDED.host_language,
            syntax_dialect_id = EXCLUDED.syntax_dialect_id,
            is_correct = EXCLUDED.is_correct,
            response_time_ms = EXCLUDED.response_time_ms,
            response_time_s = EXCLUDED.response_time_s,
            log_response_time = EXCLUDED.log_response_time,
            time_to_first_select_ms = EXCLUDED.time_to_first_select_ms,
            decision_confirm_ms = EXCLUDED.decision_confirm_ms,
            input_method = EXCLUDED.input_method,
            tab_focus_lost = EXCLUDED.tab_focus_lost,
            valid_trial = EXCLUDED.valid_trial,
            tab_switch_count = EXCLUDED.tab_switch_count,
            focus_lost_duration_ms = EXCLUDED.focus_lost_duration_ms,
            answer_change_count = EXCLUDED.answer_change_count,
            selected_key = EXCLUDED.selected_key,
            correct_option = EXCLUDED.correct_option,
            raw_response = EXCLUDED.raw_response;
        """,
        (
            resp_id, pid, session_id, ts_iso,
            q_num, trial_block, q_cat,
            code_structure, operator_count, assigned_group,
            host_lang, dialect_id, is_correct_val,
            rt_ms, rt_s, log_rt,
            first_select_ms, decision_confirm_ms, input_method,
            tab_focus_lost_val, valid_trial_val, tab_switch_cnt,
            focus_lost_dur, ans_change_cnt,
            sel_key, canonical_ck, Json(r)
        )
    )
    _sync_participant_columns_to_all_responses(cur, pid)
    _recompute_participant_trial_summary(cur, pid)

def upsert_final_thought_pg(cur, ft):
    """Upserts a FINAL_THOUGHT event into public.participant_results and syncs to public.all_participant_responses."""
    if not isinstance(ft, dict):
        return
    pid = str(ft.get('participantId') or '').strip()
    if not pid:
        return

    _ensure_participant_exists(cur, pid)

    l_clarity = resolve_likert_val(ft, 'clarity')
    l_difficulty = resolve_likert_val(ft, 'difficulty')
    l_interface = resolve_likert_val(ft, 'interface')
    l_experience = resolve_likert_val(ft, 'experience')
    dur_exp = str(ft.get('durationExpectation', ft.get('duration_expectation', '')) or '')
    thoughts_txt = str(ft.get('thoughts', '') or '')

    cur.execute(
        """
        UPDATE public.participant_results SET
            likert_clarity = %s,
            likert_difficulty = %s,
            likert_interface = %s,
            likert_experience = %s,
            duration_expectation = %s,
            final_thoughts = %s,
            raw_final_thought = %s,
            updated_at = NOW()
        WHERE participant_id = %s;
        """,
        (l_clarity, l_difficulty, l_interface, l_experience, dur_exp, thoughts_txt, Json(ft), pid)
    )
    _sync_participant_columns_to_all_responses(cur, pid)

def load_db_data():
    """Loads responses, trainingResponses, demographics, and finalThoughts directly from the 3 PostgreSQL tables."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Trial responses (Q1-Q25) from public.all_participant_responses
            cur.execute(
                """
                SELECT * FROM public.all_participant_responses
                ORDER BY participant_id ASC, question_number ASC;
                """
            )
            responses = []
            for row in cur.fetchall():
                raw = row.get('raw_response')
                if isinstance(raw, dict) and raw.get('participantId'):
                    responses.append(raw)
                else:
                    responses.append({
                        "id": row.get("response_id") or f"{row['participant_id']}_q{row['question_number']}",
                        "participantId": row["participant_id"],
                        "sessionId": row.get("session_id") or "",
                        "timestamp": row.get("timestamp_iso") or "",
                        "questionNumber": row["question_number"],
                        "questionCategory": row.get("question_category") or "",
                        "codeStructure": row.get("code_structure"),
                        "operatorCount": row.get("operator_count"),
                        "assignedGroupName": row.get("assigned_group") or "",
                        "hostLanguage": row.get("host_language") or "",
                        "activeDialect": row.get("syntax_dialect_id") or "",
                        "isCorrect": row.get("is_correct"),
                        "responseTimeMs": row.get("response_time_ms"),
                        "timeToFirstSelectMs": row.get("time_to_first_select_ms"),
                        "decisionConfirmMs": row.get("decision_confirm_ms"),
                        "inputMethod": row.get("input_method") or "",
                        "tabFocusLost": bool(row.get("tab_focus_lost")),
                        "tabSwitchCount": row.get("tab_switch_count") or 0,
                        "focusLostDurationMs": row.get("focus_lost_duration_ms") or 0,
                        "answerChangeCount": row.get("answer_change_count") or 0,
                        "selectedKey": row.get("selected_key"),
                        "correctKey": row.get("correct_option")
                    })

            # 2. Per-participant demographics, training responses, and final thoughts from public.participant_results
            cur.execute("SELECT * FROM public.participant_results ORDER BY created_at ASC, participant_id ASC;")
            training_responses = []
            demographics = {}
            final_thoughts = {}

            for row in cur.fetchall():
                pid = row["participant_id"]

                # Demographics
                raw_demo = row.get("raw_demographic")
                if isinstance(raw_demo, dict) and raw_demo.get("participantId"):
                    demographics[pid] = raw_demo
                else:
                    demographics[pid] = {
                        "participantId": pid,
                        "sessionId": row.get("session_id") or "",
                        "assignedGroupName": row.get("assigned_group") or "",
                        "hostLanguage": row.get("host_language") or "",
                        "age": row.get("age"),
                        "gender": row.get("gender"),
                        "genderLabel": row.get("gender_label") or "",
                        "education": row.get("education"),
                        "educationLabel": row.get("education_label") or "",
                        "codingExp": row.get("coding_exp_years"),
                        "dbExp": row.get("db_exp_years"),
                        "primaryLanguage": row.get("primary_language") or "",
                        "countryOfOrigin": row.get("country_of_origin") or ""
                    }

                # Training responses (T1-T4)
                raw_tr_list = row.get("raw_training_responses")
                if isinstance(raw_tr_list, list) and len(raw_tr_list) > 0:
                    for item in raw_tr_list:
                        if isinstance(item, dict) and item.get("participantId"):
                            training_responses.append(item)
                else:
                    for t_idx in range(1, 5):
                        sk = row.get(f"t{t_idx}_selected_key")
                        if sk is not None:
                            training_responses.append({
                                "participantId": pid,
                                "sessionId": row.get("session_id") or "",
                                "questionNumber": t_idx,
                                "selectedKey": sk,
                                "correctKey": row.get(f"t{t_idx}_correct_option"),
                                "isCorrect": row.get(f"t{t_idx}_is_correct"),
                                "responseTimeMs": row.get(f"t{t_idx}_time_ms"),
                                "isTraining": True
                            })

                # Final thoughts / Questionnaire
                raw_ft = row.get("raw_final_thought")
                if isinstance(raw_ft, dict) and raw_ft.get("participantId"):
                    final_thoughts[pid] = raw_ft
                elif (
                    row.get("likert_clarity") is not None
                    or row.get("duration_expectation")
                    or row.get("final_thoughts")
                ):
                    final_thoughts[pid] = {
                        "participantId": pid,
                        "likertRatings": {
                            "clarity": row.get("likert_clarity"),
                            "difficulty": row.get("likert_difficulty"),
                            "interface": row.get("likert_interface"),
                            "experience": row.get("likert_experience")
                        },
                        "durationExpectation": row.get("duration_expectation") or "",
                        "thoughts": row.get("final_thoughts") or ""
                    }

            return {
                "responses": responses,
                "trainingResponses": training_responses,
                "demographics": demographics,
                "finalThoughts": final_thoughts
            }
    finally:
        conn.close()

def generate_anova_csv_bytes():
    """Queries the 66 columns directly from public.all_participant_responses and formats the ANOVA CSV in memory."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cols_sql = ", ".join(CSV_HEADERS)
            cur.execute(
                f"SELECT {cols_sql} FROM public.all_participant_responses ORDER BY participant_id ASC, question_number ASC;"
            )
            rows = cur.fetchall()
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(CSV_HEADERS)
            for row in rows:
                writer.writerow(["" if val is None else val for val in row])
            return buf.getvalue().encode("utf-8")
    finally:
        conn.close()

class TelemetryHandler(http.server.SimpleHTTPRequestHandler):
    directory = BASE_DIR

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def get_request_admin_token(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:].strip()
        header_token = self.headers.get('X-Admin-Token', '').strip()
        if header_token:
            return header_token
        cookies = parse_cookies(self.headers.get('Cookie', ''))
        return cookies.get('admin_session', '').strip()

    def is_admin_authenticated(self):
        token = self.get_request_admin_token()
        return verify_admin_session_token(token)

    def send_json(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, Authorization, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, Authorization, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path).path

        if parsed_path in ('', '/'):
            self.send_response(302)
            self.send_header('Location', '/participant.html')
            self.end_headers()
            return

        if parsed_path == '/api/study-config':
            self.send_json(200, load_study_config())
            return

        if parsed_path == '/api/admin/check-auth':
            self.send_json(200, {"authenticated": self.is_admin_authenticated()})
            return

        if parsed_path == '/api/load-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                with db_lock:
                    data = load_db_data()
                self.send_json(200, data)
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        if parsed_path in ('/participant_responses_export.csv', '/api/export-csv'):
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                with db_lock:
                    csv_bytes = generate_anova_csv_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="participant_responses_export.csv"')
                self.send_header('Content-Length', str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        if parsed_path.startswith('/.') or parsed_path.startswith('/db/') or parsed_path.startswith('/pgadmin/') or parsed_path in (
            '/server.py', '/patch_nginx.py', '/sql-study.service', '/nginx_lightsail.conf',
            '/build_bundle.js', '/docker-compose.yml', '/DOCKER.md', '/STUDY_QUESTIONS_REFERENCE.md'
        ):
            self.send_json(403, {"status": "error", "message": "Forbidden"})
            return

        if parsed_path.startswith('/js/') and parsed_path not in ('/js/study.bundle.min.js', '/js/admin.bundle.min.js'):
            if not self.is_admin_authenticated():
                self.send_json(403, {"status": "error", "message": "Forbidden"})
                return

        if parsed_path == '/api/admin/extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                records = get_extra_credit_records()
                emails = [r["email"] for r in records]
                self.send_json(200, {"status": "success", "records": records, "emails": emails, "count": len(records)})
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        if parsed_path == '/api/admin/download-extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                records = get_extra_credit_records()
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(['Email', 'Course'])
                for r in records:
                    writer.writerow([r['email'], r['course']])
                content = buf.getvalue().encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="extra_credit_emails.csv"')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        return super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path).path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'

        if parsed_path == '/api/admin/login':
            try:
                payload = json.loads(body.decode('utf-8'))
                submitted_pw = str(payload.get('password', ''))
                if hmac.compare_digest(submitted_pw.encode('utf-8'), ADMIN_PASSWORD.encode('utf-8')):
                    token = create_admin_session_token()
                    self.send_json(200, {"status": "success", "token": token}, {
                        'Set-Cookie': f'admin_session={token}; Path=/; HttpOnly; SameSite=Lax'
                    })
                else:
                    self.send_json(401, {"status": "error", "message": "Invalid password"})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/admin/logout':
            revoke_admin_session_token(self.get_request_admin_token())
            self.send_json(200, {"status": "success"}, {
                'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            })
            return

        elif parsed_path == '/api/save-telemetry':
            try:
                payload = json.loads(body.decode('utf-8'))
                is_admin = self.is_admin_authenticated()

                with db_lock:
                    pst_now = datetime.now(ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %I:%M:%S %p PST')
                    conn = get_db_connection()
                    try:
                        with conn:
                            with conn.cursor() as cur:
                                if payload.get('newDemographic'):
                                    d = payload['newDemographic']
                                    if is_legacy_demographic(d):
                                        print(f"[{pst_now}] Rejected legacy demographic from Participant={d.get('participantId')}", flush=True)
                                    else:
                                        upsert_demographic_pg(cur, d)

                                if payload.get('newTrainingResponse'):
                                    tr = payload['newTrainingResponse']
                                    if isinstance(tr, dict) and tr.get('participantId'):
                                        upsert_training_response_pg(cur, tr)

                                if payload.get('newResponse'):
                                    r = payload['newResponse']
                                    if is_legacy_response(r):
                                        print(f"[{pst_now}] Rejected legacy response from Participant={r.get('participantId')} Q={r.get('questionNumber')}", flush=True)
                                    else:
                                        upsert_response_pg(cur, r)
                                        print(f"[{pst_now}] Response logged (PostgreSQL): Participant={r.get('participantId')} Q={r.get('questionNumber')}", flush=True)

                                if payload.get('newFinalThought'):
                                    upsert_final_thought_pg(cur, payload['newFinalThought'])

                                if is_admin:
                                    if payload.get('demographics') and isinstance(payload['demographics'], dict):
                                        for _, v in payload['demographics'].items():
                                            if isinstance(v, dict) and not is_legacy_demographic(v):
                                                v_copy = dict(v)
                                                v_copy['_admin_import'] = True
                                                upsert_demographic_pg(cur, v_copy)
                                    for tr in payload.get('trainingResponses', []):
                                        if isinstance(tr, dict) and tr.get('participantId'):
                                            upsert_training_response_pg(cur, tr)
                                    for r in payload.get('responses', []):
                                        if isinstance(r, dict) and not is_legacy_response(r):
                                            upsert_response_pg(cur, r)
                                            print(f"[{pst_now}] Response logged (admin batch -> PostgreSQL): Participant={r.get('participantId')} Q={r.get('questionNumber')}", flush=True)
                                    if payload.get('finalThoughts') and isinstance(payload['finalThoughts'], dict):
                                        for _, v in payload['finalThoughts'].items():
                                            if isinstance(v, dict):
                                                upsert_final_thought_pg(cur, v)
                                elif payload.get('responses') or payload.get('demographics') or payload.get('finalThoughts'):
                                    print(f"[{pst_now}] Ignored unauthenticated batch localStorage dump on /api/save-telemetry", flush=True)

                                cur.execute("SELECT COUNT(*) FROM public.all_participant_responses;")
                                total_count = cur.fetchone()[0]
                    finally:
                        conn.close()

                self.send_json(200, {"status": "success", "count": total_count})
            except Exception as e:
                print("Error saving telemetry to PostgreSQL:", e, file=sys.stderr, flush=True)
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/assign-group':
            try:
                payload = json.loads(body.decode('utf-8'))
                pid = str(payload.get('participantId', '')).strip()
                if not pid:
                    self.send_json(400, {"status": "error", "message": "Missing participantId"})
                    return
                idx = assign_rotating_group(pid)
                pst_now = datetime.now(ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %I:%M:%S %p PST')
                print(f"[{pst_now}] Group assigned (PostgreSQL): Participant={pid} Group={idx + 1}", flush=True)
                self.send_json(200, {"status": "success", "groupIndex": idx, "groupNumber": idx + 1})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/save-extra-credit-email':
            try:
                payload = json.loads(body.decode('utf-8'))
                email = payload.get('email', '').strip()
                course = payload.get('course', '').strip()
                if not email or '@' not in email or '.' not in email:
                    self.send_json(400, {"status": "error", "message": "Please provide a valid email address."})
                    return
                append_extra_credit_email(email, course)
                self.send_json(200, {"status": "success", "message": "Email and course identifier saved for extra credit."})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/delete-user-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                payload = json.loads(body.decode('utf-8'))
                pid = payload.get('participantId')
                if not pid:
                    self.send_json(400, {"status": "error", "message": "Missing participantId"})
                    return

                with db_lock:
                    conn = get_db_connection()
                    try:
                        with conn:
                            with conn.cursor() as cur:
                                cur.execute("DELETE FROM public.participant_results WHERE participant_id = %s;", (pid,))
                                cur.execute("DELETE FROM _internal.participant_group_assignments WHERE participant_id = %s;", (pid,))
                    finally:
                        conn.close()
                self.send_json(200, {"status": "success", "deletedParticipantId": pid})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/clear-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                with db_lock:
                    conn = get_db_connection()
                    try:
                        with conn:
                            with conn.cursor() as cur:
                                cur.execute("DELETE FROM public.participant_results;")
                    finally:
                        conn.close()
                    reset_group_rotation()
                self.send_json(200, {"status": "success"})
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/admin/study-config':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                current_config = {"questions_21_30_enabled": True, "total_questions": 25}
                save_study_config(current_config)
                self.send_json(200, {"status": "success", "config": current_config})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        return super().do_POST()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)

    if hasattr(http.server, 'ThreadingHTTPServer'):
        ServerClass = http.server.ThreadingHTTPServer
    else:
        class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
            pass
        ServerClass = ThreadingHTTPServer
    ServerClass.daemon_threads = True
    ServerClass.allow_reuse_address = True

    init_postgres_schema()
    httpd = ServerClass(server_address, TelemetryHandler)
    print("=========================================================")
    print("   SQL Test Suite Telemetry Server Started at:")
    print(f"   http://localhost:{port} (Threaded)")
    print(f"   POSTGRESQL DB: {POSTGRES_USER}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
    print("=========================================================", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")
