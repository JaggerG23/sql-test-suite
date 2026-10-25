"""
Backend Telemetry & Study Configuration Server (25-Question SQL Readability Study)
Serves API endpoints (/api/telemetry, /api/group-assign, /api/config, /api/admin/*,
/api/export-csv, /api/export-extra-credit) behind Nginx on AWS Lightsail or standalone locally.
"""
import http.server
import socketserver
import json
import os
import sys
import csv
import hashlib
import hmac
import tempfile
import threading
import time
import urllib.parse
import re
import math
import secrets
from http.cookies import SimpleCookie
from datetime import datetime
from zoneinfo import ZoneInfo

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "telemetry_events.jsonl")
DB_FILE = os.path.join(BASE_DIR, "participant_responses_db.json")
CSV_FILE = os.path.join(BASE_DIR, "participant_responses_export.csv")
EXTRA_CREDIT_FILE = os.path.join(BASE_DIR, "extra_credit_emails.csv")
CONFIG_FILE = os.path.join(BASE_DIR, "study_config.json")
GROUP_ROTATION_FILE = os.path.join(BASE_DIR, "group_rotation.json")
NUM_STUDY_GROUPS = 4

config_lock = threading.Lock()
rotation_lock = threading.Lock()

def _safe_os_replace(temp_name, target_path, retries=6, delay=0.02):
    """Atomically replaces target_path with temp_name, retrying briefly on transient Windows/OS file locks."""
    last_err = None
    for attempt in range(retries):
        try:
            os.replace(temp_name, target_path)
            return True
        except PermissionError as err:
            last_err = err
            time.sleep(delay * (attempt + 1))
        except Exception as err:
            last_err = err
            break
    try:
        if os.path.exists(temp_name):
            os.remove(temp_name)
    except Exception:
        pass
    if last_err:
        raise last_err
    return False

def _load_rotation_state():
    """Caller must hold rotation_lock."""
    if os.path.exists(GROUP_ROTATION_FILE):
        try:
            with open(GROUP_ROTATION_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
                if isinstance(state, dict):
                    state.setdefault("next_index", None)
                    state.setdefault("assignments", {})
                    return state
        except Exception:
            pass
    return {"next_index": None, "assignments": {}}

def _save_rotation_state(state):
    """Caller must hold rotation_lock. Writes atomically via temp file."""
    with tempfile.NamedTemporaryFile('w', dir=BASE_DIR, delete=False, encoding='utf-8') as f:
        json.dump(state, f, indent=2)
        f.flush()
        temp_name = f.name
    _safe_os_replace(temp_name, GROUP_ROTATION_FILE)

def assign_rotating_group(participant_id):
    """Round-robin group assignment.

    The very first participant gets a random group (0-3 => groups 1-4). Every
    subsequent new participant gets the next group in order, wrapping 4 -> 1,
    so group sizes never differ by more than one. Re-requests for an already
    assigned participant return the same group.
    """
    with rotation_lock:
        state = _load_rotation_state()
        existing = state["assignments"].get(participant_id)
        if isinstance(existing, int) and 0 <= existing < NUM_STUDY_GROUPS:
            return existing

        idx = state.get("next_index")
        if not isinstance(idx, int) or not (0 <= idx < NUM_STUDY_GROUPS):
            idx = secrets.randbelow(NUM_STUDY_GROUPS)

        state["assignments"][participant_id] = idx
        state["next_index"] = (idx + 1) % NUM_STUDY_GROUPS
        _save_rotation_state(state)
        return idx

def reset_group_rotation():
    with rotation_lock:
        _save_rotation_state({"next_index": None, "assignments": {}})

def load_study_config():
    with config_lock:
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    cfg = json.load(f)
                    if isinstance(cfg, dict):
                        cfg["questions_21_30_enabled"] = True
                        cfg["total_questions"] = 25
                        return cfg
            except Exception:
                pass
        return {"questions_21_30_enabled": True, "total_questions": 25}

def save_study_config(cfg):
    with config_lock:
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2)
        except Exception as e:
            print(f"Error saving study_config: {e}")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
if not ADMIN_PASSWORD:
    # Load from .env file if present
    env_file = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as ef:
                for line in ef:
                    line = line.strip()
                    if line.startswith("ADMIN_PASSWORD="):
                        ADMIN_PASSWORD = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
if not ADMIN_PASSWORD:
    print("WARNING: ADMIN_PASSWORD environment variable is not set. Using fallback password from environment default.", file=sys.stderr)
    ADMIN_PASSWORD = "StefiksLabRootPassword"

auth_lock = threading.Lock()
ACTIVE_ADMIN_TOKENS = set()

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

db_lock = threading.Lock()
email_lock = threading.Lock()

def append_extra_credit_email(email, course=""):
    """Appends an email and course identifier to a completely separate, isolated CSV file with zero linkage to telemetry."""
    clean_email = email.strip().lower()
    clean_course = (course or "").strip().upper()
    with email_lock:
        file_exists = os.path.exists(EXTRA_CREDIT_FILE) and os.path.getsize(EXTRA_CREDIT_FILE) > 0
        existing_entries = set()
        needs_upgrade = False
        existing_rows = []

        if file_exists:
            with open(EXTRA_CREDIT_FILE, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if header and (len(header) < 2 or 'course' not in [h.lower() for h in header]):
                    needs_upgrade = True
                for row in reader:
                    if row and row[0].strip():
                        em = row[0].strip().lower()
                        cs = row[1].strip() if len(row) > 1 else ""
                        existing_entries.add((em, cs))
                        existing_rows.append([em, cs])

        if needs_upgrade:
            with open(EXTRA_CREDIT_FILE, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Email', 'Course'])
                for r in existing_rows:
                    writer.writerow(r)

        if (clean_email, clean_course) not in existing_entries:
            existing_entries.add((clean_email, clean_course))
            sorted_rows = sorted(existing_entries, key=lambda x: (x[0], x[1]))
            with tempfile.NamedTemporaryFile('w', dir=BASE_DIR, delete=False, encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Email', 'Course'])
                for em, cs in sorted_rows:
                    writer.writerow([em, cs])
                f.flush()
                temp_name = f.name
            _safe_os_replace(temp_name, EXTRA_CREDIT_FILE)
        return True

def migrate_legacy_txt_emails():
    """Migrates any legacy extra_credit_emails.txt into extra_credit_emails.csv safely."""
    legacy_file = os.path.join(BASE_DIR, "extra_credit_emails.txt")
    if os.path.exists(legacy_file) and os.path.getsize(legacy_file) > 0:
        try:
            with open(legacy_file, 'r', encoding='utf-8') as f:
                for line in f:
                    candidate = line.strip()
                    if '@' in candidate and '.' in candidate:
                        parts = candidate.split(',', 1)
                        if len(parts) == 2:
                            append_extra_credit_email(parts[0].strip(), parts[1].strip())
                        else:
                            append_extra_credit_email(parts[0].strip(), "")
        except Exception as e:
            print(f"Notice: legacy email migration exception: {e}")

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
    return STRUCTURE_BY_QUESTION[idx] if 0 <= idx < len(STRUCTURE_BY_QUESTION) else ''

def get_operator_count_for_question(q_num):
    idx = (int(q_num) if q_num else 1) - 1
    return OPERATOR_COUNT_BY_QUESTION[idx] if 0 <= idx < len(OPERATOR_COUNT_BY_QUESTION) else ''

def get_correct_key_for_question(q_num):
    idx = (int(q_num) if q_num else 1) - 1
    return CORRECT_KEY_BY_QUESTION[idx] if 0 <= idx < len(CORRECT_KEY_BY_QUESTION) else ''

def get_training_correct_key_for_question(t_num):
    idx = (int(t_num) if t_num else 1) - 1
    return TRAINING_CORRECT_KEY_BY_QUESTION[idx] if 0 <= idx < len(TRAINING_CORRECT_KEY_BY_QUESTION) else ''

def resolve_correct_key(r):
    if not isinstance(r, dict):
        return ''
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
    return ''

def resolve_likert_val(thought_obj, short_key):
    if not isinstance(thought_obj, dict):
        return ''
    full_key = f'likert_{short_key}'
    lr = thought_obj.get('likertRatings') or {}
    if not isinstance(lr, dict):
        lr = {}
    for candidate in (thought_obj.get(full_key), thought_obj.get(short_key), lr.get(full_key), lr.get(short_key)):
        if candidate is not None and str(candidate).strip() != '':
            return candidate
    return ''

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
        return ''
    match = re.search(r'\d+', str(val))
    return int(match.group(0)) if match else ''

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
        return {'code': '', 'label': '', 'has_degree': 0}
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
        return {'code': '', 'label': '', 'is_male': 0, 'is_female': 0}
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

def parse_disability_info(val):
    s = str(val or '').strip().lower()
    has_dis = 1 if (s and 'none' not in s and s != 'no' and 'prefer not' not in s) else 0
    return {'disability': val or '', 'has_disability': has_dis}

def to_binary(val):
    if val is True or val == 1 or str(val).strip().upper() in ('TRUE', '1', 'T'):
        return 1
    return 0

def parse_cookies(cookie_header):
    if not cookie_header: return {}
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
        return {k: v.value for k, v in cookie.items()}
    except Exception: return {}

# In-memory state cache protected by db_lock to avoid O(N^2) full-log disk scans on every POST
_MEM_DB_CACHE = {
    "initialized": False,
    "log_size": -1,
    "log_mtime_ns": -1,
    "responses_map": {},
    "training_map": {},
    "demographics": {},
    "finalThoughts": {}
}

def _get_log_file_stat():
    if not os.path.exists(LOG_FILE):
        return (0, 0)
    try:
        st = os.stat(LOG_FILE)
        return (st.st_size, getattr(st, 'st_mtime_ns', int(st.st_mtime * 1e9)))
    except Exception:
        return (-1, -1)

def _apply_event_to_maps(etype, edata, responses_map, training_map, demographics, final_thoughts):
    """Applies a single telemetry event to the state dictionaries in O(1) time."""
    if not isinstance(edata, dict):
        return
    if etype == "RESPONSE":
        pid = edata.get('participantId')
        q_num = edata.get('questionNumber')
        if pid and q_num is not None:
            comp_key = f"pq::{pid}::{q_num}"
            # If an older entry was stored by raw id, remove it once
            rid = edata.get('id')
            if rid and rid in responses_map and rid != comp_key:
                del responses_map[rid]
            responses_map[comp_key] = edata
        else:
            rid = edata.get('id') or f"{pid}_{q_num}"
            responses_map[rid] = edata
    elif etype == "TRAINING_RESPONSE":
        pid = edata.get('participantId')
        q_num = edata.get('questionNumber')
        if pid and q_num is not None:
            training_map[f"pt::{pid}::{q_num}"] = edata
    elif etype == "DEMOGRAPHICS":
        pid = edata.get('participantId')
        if pid:
            demographics[pid] = edata
            # In live participant flow, demographics are submitted before training & Q1-Q25.
            # Clear any earlier responses from prior sessions for this pid, while preserving
            # responses from the same sessionId if demographics was retried out-of-order.
            if not edata.get('_admin_import'):
                demo_sid = edata.get('sessionId')
                demo_ts = str(edata.get('timestamp') or '')
                stale_keys = [
                    k for k, v in responses_map.items()
                    if v.get('participantId') == pid and not (
                        (demo_sid and v.get('sessionId') == demo_sid) or
                        (demo_ts and str(v.get('timestamp') or '') > demo_ts)
                    )
                ]
                for sk in stale_keys:
                    del responses_map[sk]
                stale_t_keys = [
                    k for k, v in training_map.items()
                    if v.get('participantId') == pid and not (
                        (demo_sid and v.get('sessionId') == demo_sid) or
                        (demo_ts and str(v.get('timestamp') or '') > demo_ts)
                    )
                ]
                for tk in stale_t_keys:
                    del training_map[tk]
    elif etype == "FINAL_THOUGHT":
        pid = edata.get('participantId')
        if pid:
            final_thoughts[pid] = edata
    elif etype == "DELETE_USER":
        pid = edata.get("participantId")
        if pid:
            stale_keys = [k for k, v in responses_map.items() if v.get('participantId') == pid]
            for sk in stale_keys:
                del responses_map[sk]
            stale_t_keys = [k for k, v in training_map.items() if v.get('participantId') == pid]
            for tk in stale_t_keys:
                del training_map[tk]
            demographics.pop(pid, None)
            final_thoughts.pop(pid, None)
    elif etype == "CLEAR_ALL":
        responses_map.clear()
        training_map.clear()
        demographics.clear()
        final_thoughts.clear()

def append_event(event_type, data):
    """Appends an event to the append-only JSONL log file and updates in-memory cache. Caller must hold db_lock."""
    pre_size, pre_mtime = _get_log_file_stat()
    cache_was_synced = (
        _MEM_DB_CACHE["initialized"] and
        _MEM_DB_CACHE["log_size"] == pre_size and
        _MEM_DB_CACHE["log_mtime_ns"] == pre_mtime
    )

    event = {"type": event_type, "data": data}
    line_str = json.dumps(event) + '\n'
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line_str)
        f.flush()

    if cache_was_synced:
        _apply_event_to_maps(
            event_type,
            data,
            _MEM_DB_CACHE["responses_map"],
            _MEM_DB_CACHE["training_map"],
            _MEM_DB_CACHE["demographics"],
            _MEM_DB_CACHE["finalThoughts"]
        )
        post_size, post_mtime = _get_log_file_stat()
        _MEM_DB_CACHE["log_size"] = post_size
        _MEM_DB_CACHE["log_mtime_ns"] = post_mtime

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

def load_db_data():
    """Returns reconstructed state from the in-memory cache or replays the append-only log if modified externally."""
    if not os.path.exists(LOG_FILE):
        _MEM_DB_CACHE["initialized"] = True
        _MEM_DB_CACHE["log_size"] = 0
        _MEM_DB_CACHE["log_mtime_ns"] = 0
        _MEM_DB_CACHE["responses_map"].clear()
        _MEM_DB_CACHE["training_map"].clear()
        _MEM_DB_CACHE["demographics"].clear()
        _MEM_DB_CACHE["finalThoughts"].clear()
        return {"responses": [], "trainingResponses": [], "demographics": {}, "finalThoughts": {}}

    cur_size, cur_mtime = _get_log_file_stat()
    if (
        _MEM_DB_CACHE["initialized"] and
        _MEM_DB_CACHE["log_size"] == cur_size and
        _MEM_DB_CACHE["log_mtime_ns"] == cur_mtime
    ):
        return {
            "responses": list(_MEM_DB_CACHE["responses_map"].values()),
            "trainingResponses": list(_MEM_DB_CACHE["training_map"].values()),
            "demographics": dict(_MEM_DB_CACHE["demographics"]),
            "finalThoughts": dict(_MEM_DB_CACHE["finalThoughts"])
        }

    responses_map = {}
    training_map = {}
    demographics = {}
    final_thoughts = {}

    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    etype = event.get("type")
                    edata = event.get("data", {})
                    _apply_event_to_maps(etype, edata, responses_map, training_map, demographics, final_thoughts)
                except Exception:
                    continue
    except Exception as e:
        print(f"Error reading log: {e}")

    _MEM_DB_CACHE["initialized"] = True
    _MEM_DB_CACHE["log_size"] = cur_size
    _MEM_DB_CACHE["log_mtime_ns"] = cur_mtime
    _MEM_DB_CACHE["responses_map"] = responses_map
    _MEM_DB_CACHE["training_map"] = training_map
    _MEM_DB_CACHE["demographics"] = demographics
    _MEM_DB_CACHE["finalThoughts"] = final_thoughts

    return {
        "responses": list(responses_map.values()),
        "trainingResponses": list(training_map.values()),
        "demographics": dict(demographics),
        "finalThoughts": dict(final_thoughts)
    }

def export_csv(db_data):
    """Exports reconstructed state to CSV formatted for immediate ANOVA / statistical analysis."""
    responses = db_data.get('responses', [])
    training_responses = db_data.get('trainingResponses', [])
    demographics = db_data.get('demographics', {})
    final_thoughts = db_data.get('finalThoughts', {})

    if not responses:
        if os.path.exists(CSV_FILE):
            try: os.remove(CSV_FILE)
            except: pass
        return

    # Group responses by participant and sort each participant's responses by question_number ascending (1..25)
    by_pid_responses = {}
    for r in responses:
        if not isinstance(r, dict):
            continue
        pid_key = r.get('participantId', '')
        by_pid_responses.setdefault(pid_key, []).append(r)

    sorted_responses = []
    for pid_key, r_list in by_pid_responses.items():
        r_list.sort(key=lambda x: int(x.get('questionNumber') or 0) if str(x.get('questionNumber') or '').isdigit() else 0)
        sorted_responses.extend(r_list)

    # Index standalone training responses by (pid, t_num)
    training_records_by_pid = {}
    for tr in training_responses:
        if not isinstance(tr, dict):
            continue
        pid_key = tr.get('participantId', '')
        if not pid_key:
            continue
        try:
            t_num = int(tr.get('questionNumber') or 0)
        except Exception:
            t_num = 0
        if 1 <= t_num <= 4:
            training_records_by_pid.setdefault(pid_key, {})[t_num] = tr

    # Pre-compute the 18 training columns (t1_* .. t4_*, training_accuracy, training_total_time_s) once per participant
    parsed_training_cols = {}
    def get_participant_training_cols(pid):
        if pid in parsed_training_cols:
            return parsed_training_cols[pid]

        t_map = training_records_by_pid.get(pid, {})
        user_resps = by_pid_responses.get(pid, [])

        cols_16 = []
        answered_cnt = 0
        correct_cnt = 0
        total_ms = 0

        for t_num in range(1, 5):
            canon_ck = get_training_correct_key_for_question(t_num)
            tr = t_map.get(t_num)
            sk_val = ''
            ic_val = ''
            tm_val = ''
            co_val = ''

            if tr:
                raw_sk = tr.get('selectedKey')
                raw_tm = tr.get('responseTimeMs', tr.get('time_ms', ''))
                raw_ic = tr.get('isCorrect')
                if raw_sk is not None and str(raw_sk).strip() != '':
                    try:
                        sk_val = int(raw_sk)
                    except Exception:
                        sk_val = str(raw_sk).strip()
                if raw_tm is not None and str(raw_tm).strip() != '':
                    try:
                        tm_val = max(0, int(float(raw_tm)))
                    except Exception:
                        tm_val = ''
                if sk_val != '' and canon_ck != '':
                    ic_val = 1 if str(sk_val) == str(canon_ck) else 0
                elif raw_ic is not None and str(raw_ic).strip() != '':
                    ic_val = to_binary(raw_ic)
                co_val = canon_ck
            else:
                # Fallback: check embedded t{N}_* fields on participant's study responses
                for ur in user_resps:
                    raw_sk = ur.get(f't{t_num}_selected_key', ur.get(f't{t_num}SelectedKey', ''))
                    raw_tm = ur.get(f't{t_num}_time_ms', ur.get(f't{t_num}TimeMs', ''))
                    raw_ic = ur.get(f't{t_num}_is_correct', ur.get(f't{t_num}IsCorrect', ''))
                    if (raw_sk is not None and str(raw_sk).strip() != '') or (raw_tm is not None and str(raw_tm).strip() != ''):
                        if raw_sk is not None and str(raw_sk).strip() != '':
                            try:
                                sk_val = int(raw_sk)
                            except Exception:
                                sk_val = str(raw_sk).strip()
                        if raw_tm is not None and str(raw_tm).strip() != '':
                            try:
                                tm_val = max(0, int(float(raw_tm)))
                            except Exception:
                                tm_val = ''
                        if sk_val != '' and canon_ck != '':
                            ic_val = 1 if str(sk_val) == str(canon_ck) else 0
                        elif raw_ic is not None and str(raw_ic).strip() != '':
                            ic_val = to_binary(raw_ic)
                        co_val = canon_ck
                        break

            cols_16.extend([sk_val, co_val, ic_val, tm_val])
            if ic_val != '':
                answered_cnt += 1
                if ic_val == 1:
                    correct_cnt += 1
            if tm_val != '':
                total_ms += tm_val

        if answered_cnt > 0:
            t_acc = round((correct_cnt / answered_cnt) * 100.0, 2)
            if t_acc == int(t_acc):
                t_acc = int(t_acc)
            t_time_s = round(total_ms / 1000.0, 3)
            if t_time_s == int(t_time_s):
                t_time_s = int(t_time_s)
            res = cols_16 + [t_acc, t_time_s]
            parsed_training_cols[pid] = res
            return res

        # Legacy fallback when only summary training_accuracy / training_total_time_s exist
        t_acc = ''
        t_time_s = ''
        for ur in user_resps:
            cand_acc = ur.get('trainingAccuracy', ur.get('training_accuracy', ''))
            cand_time = ur.get('trainingTotalTimeS', ur.get('training_total_time_s', ''))
            if cand_acc is not None and str(cand_acc).strip() != '':
                t_acc = cand_acc
                t_time_s = cand_time if cand_time is not None else ''
                break
        res = cols_16 + [t_acc, t_time_s]
        parsed_training_cols[pid] = res
        return res

    # Pre-compute parsed demographic and final-thought columns once per participant (O(P) instead of O(25*P))
    parsed_participant_cols = {}
    def get_participant_meta_cols(pid):
        if pid in parsed_participant_cols:
            return parsed_participant_cols[pid]
        demo = demographics.get(pid, {})
        thought_obj = final_thoughts.get(pid, {})
        age_val = parse_age(demo.get('age', ''))
        gender_info = parse_gender_info(demo.get('gender', ''))
        edu_info = parse_education_info(demo.get('education', demo.get('highestEducation', demo.get('academicStanding', ''))))
        coding_years = parse_num(demo.get('codingExp', ''))
        db_years = parse_num(demo.get('dbExp', ''))
        lang_info = parse_language_info(demo.get('primaryLanguage', ''))
        country_info = parse_country_info(demo.get('countryOfOrigin', ''))
        cols = (
            demo,
            [
                age_val,
                gender_info['code'],
                gender_info['label'],
                gender_info['is_male'],
                gender_info['is_female'],
                edu_info['code'],
                edu_info['label'],
                edu_info['has_degree'],
                coding_years,
                1 if coding_years > 0 else 0,
                db_years,
                1 if db_years > 0 else 0,
                lang_info['language'],
                lang_info['is_english'],
                country_info['country'],
                country_info['is_us'],
                resolve_likert_val(thought_obj, 'clarity'),
                resolve_likert_val(thought_obj, 'difficulty'),
                resolve_likert_val(thought_obj, 'interface'),
                resolve_likert_val(thought_obj, 'experience'),
                thought_obj.get('durationExpectation', thought_obj.get('duration_expectation', '')),
                thought_obj.get('thoughts', '')
            ]
        )
        parsed_participant_cols[pid] = cols
        return cols

    with tempfile.NamedTemporaryFile('w', dir=BASE_DIR, delete=False, newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
        for r in sorted_responses:
            pid = r.get('participantId', '')
            demo, tail_cols = get_participant_meta_cols(pid)
            training_cols = get_participant_training_cols(pid)

            # Trial sequence & block (5 blocks of 5 questions for 25-question study)
            raw_q_num = r.get('questionNumber', 1)
            try:
                q_num = int(raw_q_num)
            except:
                q_num = 1
            trial_block = ((max(1, q_num) - 1) // 5) + 1
            code_structure = r.get('codeStructure') or r.get('code_structure') or get_structure_for_question(q_num)
            raw_op_cnt = r.get('operatorCount', r.get('operator_count', ''))
            operator_count = raw_op_cnt if (raw_op_cnt is not None and str(raw_op_cnt).strip() != '') else get_operator_count_for_question(q_num)

            # Authoritative server-side correctness grading against canonical key
            canonical_ck = get_correct_key_for_question(q_num)
            sel_key = r.get('selectedKey')
            if canonical_ck != '' and sel_key is not None and str(sel_key).strip() != '':
                is_correct_val = 1 if str(sel_key).strip() == str(canonical_ck) else 0
            else:
                is_correct_val = to_binary(r.get('isCorrect'))

            raw_rt_ms = r.get('responseTimeMs', 0)
            try:
                rt_ms = int(raw_rt_ms) if raw_rt_ms is not None else 0
            except:
                rt_ms = 0
            rt_s = round(rt_ms / 1000.0, 3)
            log_rt = round(math.log(max(rt_ms, 1)), 4)

            raw_first_sel = r.get('timeToFirstSelectMs', r.get('time_to_first_select_ms', ''))
            first_select_ms = int(raw_first_sel) if (raw_first_sel is not None and str(raw_first_sel).strip() != '') else ''
            raw_confirm_ms = r.get('decisionConfirmMs', r.get('decision_confirm_ms', ''))
            decision_confirm_ms = int(raw_confirm_ms) if (raw_confirm_ms is not None and str(raw_confirm_ms).strip() != '') else ''
            input_method = r.get('inputMethod', r.get('input_method', ''))

            # Focus and trial validity (1s and 0s)
            tab_focus_lost_val = to_binary(r.get('tabFocusLost'))
            valid_trial_val = 1 if tab_focus_lost_val == 0 else 0

            # Answer change count
            try:
                ans_change_cnt = int(r.get('answerChangeCount', 0))
            except:
                ans_change_cnt = 0

            # Group and Dialect
            assigned_group = r.get('assignedGroupName', r.get('assignedGroup', demo.get('assignedGroupName', demo.get('assignedGroup', ''))))

            writer.writerow([
                r.get('id', ''),
                pid,
                r.get('sessionId', ''),
                r.get('timestamp', ''),
                q_num,
                trial_block,
                r.get('questionCategory', ''),
                code_structure,
                operator_count,
                assigned_group,
                r.get('hostLanguage', demo.get('hostLanguage', '')),
                r.get('activeDialect', ''),
                is_correct_val,
                rt_ms,
                rt_s,
                log_rt,
                first_select_ms,
                decision_confirm_ms,
                input_method,
                tab_focus_lost_val,
                valid_trial_val,
                r.get('tabSwitchCount', 0),
                r.get('focusLostDurationMs', 0),
                ans_change_cnt,
                r.get('selectedKey', ''),
                resolve_correct_key(r),
                *training_cols,
                *tail_cols
            ])
        f.flush()
        temp_name = f.name
    _safe_os_replace(temp_name, CSV_FILE)

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

            with db_lock:
                data = load_db_data()
            self.send_json(200, data)
            return

        if parsed_path.startswith('/.') or parsed_path in (
            '/server.py', '/patch_nginx.py', '/sql-study.service', '/nginx.conf', '/nginx_lightsail.conf', '/build_bundle.js'
        ):
            self.send_json(403, {"status": "error", "message": "Forbidden"})
            return

        # Block direct access to unbundled raw JS source files so participants cannot inspect unminified source
        if parsed_path.startswith('/js/') and parsed_path not in ('/js/study.bundle.min.js', '/js/admin.bundle.min.js'):
            if not self.is_admin_authenticated():
                self.send_json(403, {"status": "error", "message": "Forbidden"})
                return

        if parsed_path in (
            '/extra_credit_emails.csv', '/extra_credit_emails.txt',
            '/telemetry_events.jsonl', '/participant_responses_db.json',
            '/participant_responses_export.csv', '/group_rotation.json', '/study_config.json'
        ):
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return

        if parsed_path == '/api/admin/extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            records = []
            emails = []
            with email_lock:
                if os.path.exists(EXTRA_CREDIT_FILE):
                    with open(EXTRA_CREDIT_FILE, 'r', encoding='utf-8') as f:
                        reader = csv.reader(f)
                        header = next(reader, None)
                        for row in reader:
                            if row and row[0].strip():
                                em = row[0].strip()
                                cs = row[1].strip() if len(row) > 1 else ""
                                emails.append(em)
                                records.append({"email": em, "course": cs})
            self.send_json(200, {"status": "success", "records": records, "emails": emails, "count": len(records)})
            return

        if parsed_path == '/api/admin/download-extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            content = b""
            with email_lock:
                if os.path.exists(EXTRA_CREDIT_FILE):
                    with open(EXTRA_CREDIT_FILE, 'rb') as f:
                        content = f.read()
                else:
                    content = b"Email,Course\r\n"
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="extra_credit_emails.csv"')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
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
                    # Handle incremental payloads from live study participants
                    if payload.get('newResponse'):
                        r = payload['newResponse']
                        if is_legacy_response(r):
                            print(f"[{pst_now}] Rejected legacy response from Participant={r.get('participantId')} Q={r.get('questionNumber')}", flush=True)
                        else:
                            r.pop('seed', None)
                            r.pop('random_seed', None)
                            try:
                                q_int = int(r.get('questionNumber') or 1)
                                ck = get_correct_key_for_question(q_int)
                                if ck != '':
                                    r['correctKey'] = ck
                                    r['isCorrect'] = 1 if str(r.get('selectedKey', '')).strip() == str(ck) else 0
                            except Exception:
                                pass
                            print(f"[{pst_now}] Response logged: Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                            append_event("RESPONSE", r)
                    if payload.get('newTrainingResponse'):
                        tr = payload['newTrainingResponse']
                        if isinstance(tr, dict) and tr.get('participantId'):
                            try:
                                tq_int = int(tr.get('questionNumber') or 1)
                                if 1 <= tq_int <= 4:
                                    tck = get_training_correct_key_for_question(tq_int)
                                    if tck != '':
                                        tr['correctKey'] = tck
                                        tr['isCorrect'] = 1 if str(tr.get('selectedKey', '')).strip() == str(tck) else 0
                                    append_event("TRAINING_RESPONSE", tr)
                            except Exception:
                                pass
                    if payload.get('newDemographic'):
                        d = payload['newDemographic']
                        if is_legacy_demographic(d):
                            print(f"[{pst_now}] Rejected legacy demographic from Participant={d.get('participantId')}", flush=True)
                        else:
                            g_info = parse_gender_info(d.get('gender'))
                            if g_info['code'] != '':
                                d['gender'] = g_info['code']
                                d['genderLabel'] = g_info['label']
                            e_info = parse_education_info(d.get('education') or d.get('highestEducation') or d.get('academicStanding'))
                            if e_info['code'] != '':
                                d['education'] = e_info['code']
                                d['educationLabel'] = e_info['label']
                            append_event("DEMOGRAPHICS", d)
                    if payload.get('newFinalThought'):
                        append_event("FINAL_THOUGHT", payload['newFinalThought'])

                    # Only allow batch arrays (responses, demographics, finalThoughts) from authenticated Admin imports.
                    # Never accept unauthenticated batch dumps from stale cached client localStorage!
                    if is_admin:
                        for tr in payload.get('trainingResponses', []):
                            if isinstance(tr, dict) and tr.get('participantId'):
                                try:
                                    tq_int = int(tr.get('questionNumber') or 1)
                                    if 1 <= tq_int <= 4:
                                        tck = get_training_correct_key_for_question(tq_int)
                                        if tck != '':
                                            tr['correctKey'] = tck
                                            tr['isCorrect'] = 1 if str(tr.get('selectedKey', '')).strip() == str(tck) else 0
                                        append_event("TRAINING_RESPONSE", tr)
                                except Exception:
                                    pass
                        for r in payload.get('responses', []):
                            if isinstance(r, dict) and not is_legacy_response(r):
                                r.pop('seed', None)
                                r.pop('random_seed', None)
                                print(f"[{pst_now}] Response logged (admin batch): Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                                append_event("RESPONSE", r)
                        if payload.get('demographics') and isinstance(payload['demographics'], dict):
                            for k, v in payload['demographics'].items():
                                if isinstance(v, dict) and not is_legacy_demographic(v):
                                    v = dict(v)
                                    v['_admin_import'] = True
                                    g_info = parse_gender_info(v.get('gender'))
                                    if g_info['code'] != '':
                                        v['gender'] = g_info['code']
                                        v['genderLabel'] = g_info['label']
                                    e_info = parse_education_info(v.get('education') or v.get('highestEducation') or v.get('academicStanding'))
                                    if e_info['code'] != '':
                                        v['education'] = e_info['code']
                                        v['educationLabel'] = e_info['label']
                                    append_event("DEMOGRAPHICS", v)
                        if payload.get('finalThoughts') and isinstance(payload['finalThoughts'], dict):
                            for k, v in payload['finalThoughts'].items():
                                if isinstance(v, dict):
                                    append_event("FINAL_THOUGHT", v)
                    elif payload.get('responses') or payload.get('demographics') or payload.get('finalThoughts'):
                        print(f"[{pst_now}] Ignored unauthenticated batch localStorage dump on /api/save-telemetry", flush=True)

                    # Export CSV
                    db_data = load_db_data()
                    export_csv(db_data)

                self.send_json(200, {"status": "success", "count": len(db_data['responses'])})
            except Exception as e:
                print("Error saving telemetry:", e)
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
                print(f"[{pst_now}] Group assigned: Participant={pid} Group={idx + 1}", flush=True)
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
                    append_event("DELETE_USER", {"participantId": pid})
                    db_data = load_db_data()
                    export_csv(db_data)
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
                    append_event("CLEAR_ALL", {})
                    if os.path.exists(CSV_FILE):
                        os.remove(CSV_FILE)
                # Fresh study: next participant starts the rotation at a new random group
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
                payload = json.loads(body.decode('utf-8'))
                current_config = load_study_config()
                current_config['questions_21_30_enabled'] = True
                current_config['total_questions'] = 25
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
        class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer): pass
        ServerClass = ThreadingHTTPServer
    ServerClass.daemon_threads = True
    ServerClass.allow_reuse_address = True

    migrate_legacy_txt_emails()
    with db_lock:
        export_csv(load_db_data())
    httpd = ServerClass(server_address, TelemetryHandler)
    print(f"=========================================================")
    print(f"   SQL Test Suite Telemetry Server Started at:")
    print(f"   http://localhost:{port} (Threaded)")
    print(f"   APPEND-ONLY LOG: {os.path.abspath(LOG_FILE)}")
    print(f"=========================================================", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")
