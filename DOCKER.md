# Docker PostgreSQL 16 & Local pgAdmin 4 Guide (AWS Lightsail 512MB VPS)

This project runs **PostgreSQL 16** (`postgres:16-alpine`, ~35 MB RAM) inside Docker Compose on the AWS Lightsail VPS (`100.22.81.170` / `jagger.cx`), while **pgAdmin 4** runs locally on your desktop PC and connects securely over an SSH tunnel (using **0 MB of RAM** on the 512 MB VPS, just like `KushaRohani/division_counting`).

## 1. Server Setup on AWS Lightsail

1. **Configure `.env` on the Lightsail server** (`/home/ubuntu/sql-randomized-test-suite/.env`):
   ```bash
   cp .env.example .env
   nano .env
   ```
   Set `ADMIN_PASSWORD` and `POSTGRES_PASSWORD`.

2. **Start PostgreSQL 16**:
   ```bash
   sudo docker compose up -d --remove-orphans
   ```

3. **Restart `sql-study.service`**:
   ```bash
   sudo systemctl restart sql-study
   ```

## 2. Connecting pgAdmin 4 Desktop (from Your Windows PC) to Lightsail

1. Download and open **[pgAdmin 4 Desktop](https://www.pgadmin.org/download/pgadmin-4-windows/)** on your computer.
2. Right-click **Servers** → **Register** → **Server...**
3. **General tab**:
   - **Name**: `SQL Study Lightsail`
4. **Connection tab**:
   - **Host name/address**: `127.0.0.1`
   - **Port**: `5432`
   - **Maintenance database**: `sql_study`
   - **Username**: `sqlstudy`
   - **Password**: `sqlstudy_secret` *(or the `POSTGRES_PASSWORD` set in your `.env`)*
   - **Save password?**: Enable toggle
5. **SSH Tunnel tab**:
   - **Use SSH tunneling?**: Enable toggle (`Yes`)
   - **Tunnel host**: `100.22.81.170` *(or `jagger.cx`)*
   - **Tunnel port**: `22`
   - **Username**: `admin`
   - **Authentication**: Select **Identity file**
   - **Identity file**: `C:\Users\fragm\Downloads\LightsailDefaultKey-us-west-2.pem`
6. **Parameters tab** *(Required on Windows pgAdmin 4 to prevent `libpq` GSS access violation)*:
   - Click **`+`** to add a row:
   - **Name**: `GSS encmode`
   - **Value**: `disable`
7. Click **Save**!

## 3. Database Tables (`sql_study` → `Schemas` → `public` → `Tables`)

- **`all_participant_responses`**: The giant 66-column master table of everyone's question responses (`Q1`–`Q25` across all participants, with training, demographic, and post-study survey columns inline on every row).
- **`participant_results`**: 1 row per participant (`participant_id`, `assigned_group`, `questions_completed`, `accuracy`, `total_time_s`, `T1`–`T4` training metrics, full demographics, and post-study questionnaire).
- **`extra_credit_emails`**: Isolated student extra-credit entries (`email`, `course`, `created_at`), unlinked from participant IDs for IRB anonymity.
