-- ============================================================================
-- PostgreSQL Schema for 25-Question SQL Readability Study
-- Modeled after KushaRohani/division_counting (Name, Experiment_data,
-- Experiment_per_question, Questionnaire) + 66-Column ANOVA Export View
-- ============================================================================

-- 1. Extra Credit Table (Modeled after division_counting's "Name" table;
--    completely unlinked from participant_id for IRB anonymity)
CREATE TABLE IF NOT EXISTS extra_credit (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    course TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email, course)
);

-- 2. Main Participant & Summary Table (Modeled after division_counting's "Experiment_data")
CREATE TABLE IF NOT EXISTS experiment_data (
    id SERIAL PRIMARY KEY,
    participant_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL DEFAULT '',
    assigned_group TEXT NOT NULL DEFAULT '',
    host_language TEXT NOT NULL DEFAULT '',
    syntax_dialect_id TEXT NOT NULL DEFAULT '',
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
    -- Training trial columns (T1-T4)
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
    -- division_counting-style summary arrays & totals across Q1-Q25
    accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
    task_accuracy BOOLEAN[] NOT NULL DEFAULT '{}',
    task_ids TEXT[] NOT NULL DEFAULT '{}',
    total_time INT NOT NULL DEFAULT 0,
    per_task_time INT[] NOT NULL DEFAULT '{}',
    -- Full demographic payload for Admin Dashboard state reconstruction
    raw_demographic JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Per-Question Trial Table (Modeled after division_counting's "Experiment_per_question")
CREATE TABLE IF NOT EXISTS experiment_per_question (
    id SERIAL PRIMARY KEY,
    response_id TEXT NOT NULL DEFAULT '',
    participant_id TEXT NOT NULL REFERENCES experiment_data(participant_id) ON DELETE CASCADE,
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
    -- Full trial response payload for Admin Dashboard state reconstruction
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, question_number)
);

-- 4. Training Per-Question Table (T1-T4)
CREATE TABLE IF NOT EXISTS training_per_question (
    id SERIAL PRIMARY KEY,
    participant_id TEXT NOT NULL REFERENCES experiment_data(participant_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL DEFAULT '',
    timestamp_iso TEXT NOT NULL DEFAULT '',
    question_number INT NOT NULL,
    selected_key INT,
    correct_option INT,
    is_correct INT NOT NULL DEFAULT 0,
    response_time_ms INT NOT NULL DEFAULT 0,
    raw_training_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, question_number)
);

-- 5. Post-Study Questionnaire Table (Modeled after division_counting's "Questionnaire")
CREATE TABLE IF NOT EXISTS questionnaire (
    id SERIAL PRIMARY KEY,
    participant_id TEXT NOT NULL UNIQUE REFERENCES experiment_data(participant_id) ON DELETE CASCADE,
    likert_clarity INT,
    likert_difficulty INT,
    likert_interface INT,
    likert_experience INT,
    duration_expectation TEXT NOT NULL DEFAULT '',
    final_thoughts TEXT NOT NULL DEFAULT '',
    raw_final_thought JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Group Rotation State Table (4 -> 3 -> 2 -> 1 -> reset random sampling without replacement)
CREATE TABLE IF NOT EXISTS group_rotation_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    available_groups INT[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO group_rotation_state (id, available_groups)
VALUES (1, ARRAY[0, 1, 2, 3])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS participant_group_assignments (
    participant_id TEXT PRIMARY KEY,
    group_index INT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Study Configuration Table
CREATE TABLE IF NOT EXISTS study_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    questions_21_30_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    total_questions INT NOT NULL DEFAULT 25,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO study_config (id, questions_21_30_enabled, total_questions)
VALUES (1, TRUE, 25)
ON CONFLICT (id) DO NOTHING;

-- 8. Full 66-Column ANOVA Export View (Matches CSV_HEADERS in server.py)
CREATE OR REPLACE VIEW anova_export_view AS
SELECT
    q.response_id,
    q.participant_id,
    q.session_id,
    q.timestamp_iso,
    q.question_number,
    q.trial_block,
    q.question_category,
    q.code_structure,
    q.operator_count,
    COALESCE(NULLIF(q.assigned_group, ''), d.assigned_group) AS assigned_group,
    COALESCE(NULLIF(q.host_language, ''), d.host_language) AS host_language,
    COALESCE(NULLIF(q.syntax_dialect_id, ''), d.syntax_dialect_id) AS syntax_dialect_id,
    q.is_correct,
    q.response_time_ms,
    q.response_time_s,
    q.log_response_time,
    q.time_to_first_select_ms,
    q.decision_confirm_ms,
    q.input_method,
    q.tab_focus_lost,
    q.valid_trial,
    q.tab_switch_count,
    q.focus_lost_duration_ms,
    q.answer_change_count,
    q.selected_key,
    q.correct_option,
    d.t1_selected_key, d.t1_correct_option, d.t1_is_correct, d.t1_time_ms,
    d.t2_selected_key, d.t2_correct_option, d.t2_is_correct, d.t2_time_ms,
    d.t3_selected_key, d.t3_correct_option, d.t3_is_correct, d.t3_time_ms,
    d.t4_selected_key, d.t4_correct_option, d.t4_is_correct, d.t4_time_ms,
    d.training_accuracy,
    d.training_total_time_s,
    d.age,
    d.gender,
    d.gender_label,
    d.gender_male,
    d.gender_female,
    d.education,
    d.education_label,
    d.has_college_degree,
    d.coding_exp_years,
    d.has_coding_exp,
    d.db_exp_years,
    d.has_db_exp,
    d.primary_language,
    d.is_english_primary,
    d.country_of_origin,
    d.is_country_us,
    s.likert_clarity,
    s.likert_difficulty,
    s.likert_interface,
    s.likert_experience,
    COALESCE(s.duration_expectation, '') AS duration_expectation,
    COALESCE(s.final_thoughts, '') AS final_thoughts
FROM experiment_per_question q
JOIN experiment_data d ON d.participant_id = q.participant_id
LEFT JOIN questionnaire s ON s.participant_id = q.participant_id
ORDER BY q.participant_id ASC, q.question_number ASC;
