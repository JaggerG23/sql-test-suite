# Docker & pgAdmin Deployment Guide (AWS Lightsail)

This project uses **PostgreSQL 16** and **pgAdmin 4** running via Docker Compose (`docker-compose.yml`), while `server.py` (systemd `sql-study.service`) and Nginx run on the AWS Lightsail host (`jagger.cx`).

## Quick Start on AWS Lightsail

1. **Configure `.env` on the Lightsail server** (`/home/ubuntu/sql-randomized-test-suite/.env`):
   ```bash
   cp .env.example .env
   nano .env
   ```
   Set `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `PGADMIN_DEFAULT_EMAIL`, and `PGADMIN_DEFAULT_PASSWORD`.

2. **Start PostgreSQL 16 and pgAdmin 4**:
   ```bash
   docker compose up -d
   ```

3. **Restart the backend service & reload Nginx**:
   ```bash
   sudo python3 patch_nginx.py
   sudo systemctl restart sql-study
   ```

## Services & Ports

| Service | Host Binding | Description |
| :--- | :--- | :--- |
| `postgres` | `127.0.0.1:5432` | PostgreSQL 16 (`sql_study` database, initialized with `db/init.sql`) |
| `pgadmin` | `127.0.0.1:5050` | pgAdmin 4 web interface (proxied at `https://jagger.cx/pgadmin/` and accessible via SSH tunnel) |
| `sql-study` | `127.0.0.1:8000` | Python `server.py` systemd service connected directly to PostgreSQL |

## Accessing pgAdmin 4

### Option A: Browser via HTTPS Reverse Proxy
Open **`https://jagger.cx/pgadmin/`** and sign in with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from `.env`.

### Option B: Local SSH Tunnel
From your local machine, run:
```bash
ssh -i /path/to/lightsail-key.pem -L 5050:127.0.0.1:5050 ubuntu@jagger.cx
```
Then open **`http://localhost:5050`** in your browser.

## Database Tables (`sql_study`)

When you expand **Servers → SQL Study PostgreSQL → Databases → `sql_study` → Schemas → `public`**, you will find:

- **`extra_credit`**: Isolated student extra-credit entries (`email`, `course`, `created_at`), unlinked from participant IDs for IRB anonymity.
- **`experiment_data`**: 1 row per participant (`participant_id`, demographics, assigned group, host language, dialect, T1–T4 training results, overall `accuracy`, `total_time`, and arrays `task_ids`, `task_accuracy`, `per_task_time`).
- **`experiment_per_question`**: 1 row per study question (`Q1`–`Q25`) per participant (`question_number`, `trial_block`, `code_structure`, `operator_count`, `is_correct`, `response_time_ms`, focus-loss metrics, `selected_key`, `correct_option`).
- **`training_per_question`**: 1 row per training question (`T1`–`T4`) per participant.
- **`questionnaire`**: 1-to-1 post-study survey responses (`likert_clarity`, `likert_difficulty`, `likert_interface`, `likert_experience`, `duration_expectation`, `final_thoughts`).
- **`anova_export_view`** *(View)*: Joins `experiment_per_question`, `experiment_data`, and `questionnaire` into the exact 66-column ANOVA dataset.
