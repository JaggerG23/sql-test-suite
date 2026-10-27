-- ============================================================================
-- PostgreSQL Schema for 25-Question SQL Readability Study
-- Clean 3-Table Public Layout in pgAdmin 4:
--   1. public.participant_results       (Per-participant summary, demographics, training, questionnaire)
--   2. public.all_participant_responses (Giant 66-column master table of all question responses)
--   3. public.extra_credit_emails       (Isolated anonymous extra-credit email & course table)
-- Internal server rotation/config state is stored in the `_internal` schema.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS _internal;

-- 1. Per-Participant Results Table (1 row per participant)
CREATE TABLE IF NOT EXISTS public.participant_results (
    participant_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '',
    assigned_group TEXT NOT NULL DEFAULT '',
    host_language TEXT NOT NULL DEFAULT '',
    syntax_dialect_id TEXT NOT NULL DEFAULT '',
    questions_completed INT NOT NULL DEFAULT 0,
    accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_time_ms INT NOT NULL DEFAULT 0,
    total_time_s DOUBLE PRECISION NOT NULL DEFAULT 0,
    training_accuracy DOUBLE PRECISION,
    training_total_time_s DOUBLE PRECISION,
    t1_selected_key INT,
    t1_correct_option INT,
    t1_is_correct INT,
    t1_time_ms INT,
    t2_selected_key INT,
    t2_correct_option INT,
    t2_is_correct INT,
    t2_time_ms INT,
    t3_selected_key INT,
    t3_correct_option INT,
    t3_is_correct INT,
    t3_time_ms INT,
    t4_selected_key INT,
    t4_correct_option INT,
    t4_is_correct INT,
    t4_time_ms INT,
    age INT,
    gender INT,
    gender_label TEXT NOT NULL DEFAULT '',
    gender_male INT NOT NULL DEFAULT 0,
    gender_female INT NOT NULL DEFAULT 0,
    education INT,
    education_label TEXT NOT NULL DEFAULT '',
    has_college_degree INT NOT NULL DEFAULT 0,
    coding_exp_years DOUBLE PRECISION NOT NULL DEFAULT 0,
    has_coding_exp INT NOT NULL DEFAULT 0,
    db_exp_years DOUBLE PRECISION NOT NULL DEFAULT 0,
    has_db_exp INT NOT NULL DEFAULT 0,
    primary_language TEXT NOT NULL DEFAULT '',
    is_english_primary INT NOT NULL DEFAULT 0,
    country_of_origin TEXT NOT NULL DEFAULT '',
    is_country_us INT NOT NULL DEFAULT 0,
    likert_clarity INT,
    likert_difficulty INT,
    likert_interface INT,
    likert_experience INT,
    duration_expectation TEXT NOT NULL DEFAULT '',
    final_thoughts TEXT NOT NULL DEFAULT '',
    task_ids TEXT[] NOT NULL DEFAULT '{}',
    task_accuracy BOOLEAN[] NOT NULL DEFAULT '{}',
    per_task_time INT[] NOT NULL DEFAULT '{}',
    raw_demographic JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_training_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_final_thought JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Giant 66-Column Table of Everyone (1 row per question response, all 66 ANOVA columns inline)
CREATE TABLE IF NOT EXISTS public.all_participant_responses (
    response_id TEXT NOT NULL DEFAULT '',
    participant_id TEXT NOT NULL REFERENCES public.participant_results(participant_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL DEFAULT '',
    timestamp_iso TEXT NOT NULL DEFAULT '',
    question_number INT NOT NULL,
    trial_block INT NOT NULL,
    question_category TEXT NOT NULL DEFAULT '',
    code_structure INT,
    operator_count INT,
    assigned_group TEXT NOT NULL DEFAULT '',
    host_language TEXT NOT NULL DEFAULT '',
    syntax_dialect_id TEXT NOT NULL DEFAULT '',
    is_correct INT NOT NULL DEFAULT 0,
    response_time_ms INT NOT NULL DEFAULT 0,
    response_time_s DOUBLE PRECISION NOT NULL DEFAULT 0,
    log_response_time DOUBLE PRECISION NOT NULL DEFAULT 0,
    time_to_first_select_ms INT,
    decision_confirm_ms INT,
    input_method TEXT NOT NULL DEFAULT '',
    tab_focus_lost INT NOT NULL DEFAULT 0,
    valid_trial INT NOT NULL DEFAULT 1,
    tab_switch_count INT NOT NULL DEFAULT 0,
    focus_lost_duration_ms INT NOT NULL DEFAULT 0,
    answer_change_count INT NOT NULL DEFAULT 0,
    selected_key INT,
    correct_option INT,
    t1_selected_key INT,
    t1_correct_option INT,
    t1_is_correct INT,
    t1_time_ms INT,
    t2_selected_key INT,
    t2_correct_option INT,
    t2_is_correct INT,
    t2_time_ms INT,
    t3_selected_key INT,
    t3_correct_option INT,
    t3_is_correct INT,
    t3_time_ms INT,
    t4_selected_key INT,
    t4_correct_option INT,
    t4_is_correct INT,
    t4_time_ms INT,
    training_accuracy DOUBLE PRECISION,
    training_total_time_s DOUBLE PRECISION,
    age INT,
    gender INT,
    gender_label TEXT NOT NULL DEFAULT '',
    gender_male INT NOT NULL DEFAULT 0,
    gender_female INT NOT NULL DEFAULT 0,
    education INT,
    education_label TEXT NOT NULL DEFAULT '',
    has_college_degree INT NOT NULL DEFAULT 0,
    coding_exp_years DOUBLE PRECISION NOT NULL DEFAULT 0,
    has_coding_exp INT NOT NULL DEFAULT 0,
    db_exp_years DOUBLE PRECISION NOT NULL DEFAULT 0,
    has_db_exp INT NOT NULL DEFAULT 0,
    primary_language TEXT NOT NULL DEFAULT '',
    is_english_primary INT NOT NULL DEFAULT 0,
    country_of_origin TEXT NOT NULL DEFAULT '',
    is_country_us INT NOT NULL DEFAULT 0,
    likert_clarity INT,
    likert_difficulty INT,
    likert_interface INT,
    likert_experience INT,
    duration_expectation TEXT NOT NULL DEFAULT '',
    final_thoughts TEXT NOT NULL DEFAULT '',
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (participant_id, question_number)
);

-- 3. Anonymous Extra-Credit Emails Table (Unlinked from participant_id for IRB anonymity)
CREATE TABLE IF NOT EXISTS public.extra_credit_emails (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    course TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email, course)
);

-- Internal System State Tables (kept in `_internal` schema so `public` stays clean in pgAdmin)
CREATE TABLE IF NOT EXISTS _internal.group_rotation_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    available_groups INT[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _internal.group_rotation_state (id, available_groups)
VALUES (1, ARRAY[0, 1, 2, 3])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS _internal.participant_group_assignments (
    participant_id TEXT PRIMARY KEY,
    group_index INT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS _internal.study_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    questions_21_30_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    total_questions INT NOT NULL DEFAULT 25,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _internal.study_config (id, questions_21_30_enabled, total_questions)
VALUES (1, TRUE, 25)
ON CONFLICT (id) DO NOTHING;
