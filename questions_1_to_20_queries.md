# Study Questions 1 to 20: Queries & Potential Answers

This document contains the **SQL query**, **participant code snippet**, and **all 4 potential answer choices (A, B, C, D)** for **Questions 1 through 20**.

### Download Links
- **SQL File with Answer Breakdowns**: [`questions_1_to_20_queries.sql`](file:///c:/Users/fragm/.gemini/antigravity-ide/scratch/sql-randomized-test-suite/questions_1_to_20_queries.sql)  
  *(Direct browser download: [http://localhost:8000/questions_1_to_20_queries.sql](http://localhost:8000/questions_1_to_20_queries.sql))*
- **Markdown Summary**: [`questions_1_to_20_queries.md`](file:///c:/Users/fragm/.gemini/antigravity-ide/scratch/sql-randomized-test-suite/questions_1_to_20_queries.md)  
  *(Direct browser download: [http://localhost:8000/questions_1_to_20_queries.md](http://localhost:8000/questions_1_to_20_queries.md))*
- **Structured JSON File**: [`questions_1_to_20_queries.json`](file:///c:/Users/fragm/.gemini/antigravity-ide/scratch/sql-randomized-test-suite/questions_1_to_20_queries.json)  
  *(Direct browser download: [http://localhost:8000/questions_1_to_20_queries.json](http://localhost:8000/questions_1_to_20_queries.json))*

---

## Question 1

### Executed SQL Query:
```sql
SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6 ORDER BY orders.id ASC;
```

### Code Snippet Presented to Participant:
```
counter = 0
for i in range(6):
    counter += 1

query = """
FROM orders
|> JOIN users ON orders.user_id = users.id
|> WHERE orders.id <= 6
|> SELECT orders.id, orders.amount
|> ORDER BY id ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `amount` | **Row Count:** `6`

| id | amount |
| --- | --- |
| 1 | 185.51 |
| 2 | 183.64 |
| 3 | 148.45 |
| 4 | 29.23 |
| 5 | 21.95 |
| 6 | 176.21 |

#### Option B *[Distractor]*
*Unfiltered data (WHERE clause conditions were not applied).*

**Columns:** `id`, `amount` | **Row Count:** `30`

| id | amount |
| --- | --- |
| 1 | 185.51 |
| 2 | 183.64 |
| 3 | 148.45 |
| 4 | 29.23 |
| 5 | 21.95 |
| 6 | 176.21 |
| 7 | 24.96 |
| 8 | 57.03 |
| 9 | 26.82 |
| 10 | 16.76 |
| 11 | 203.08 |
| 12 | 11.42 |
| 13 | 162.1 |
| 14 | 91.33 |
| 15 | 40.08 |
| *... and 15 more rows* | |

#### Option C *[Distractor]*
*Assumes rows are sorted by orders.amount in descending order.*

**Columns:** `id`, `amount` | **Row Count:** `6`

| id | amount |
| --- | --- |
| 1 | 185.51 |
| 2 | 183.64 |
| 6 | 176.21 |
| 3 | 148.45 |
| 4 | 29.23 |
| 5 | 21.95 |

#### Option D *[Distractor]*
*Assumes rows are sorted by orders.id in descending order.*

**Columns:** `id`, `amount` | **Row Count:** `6`

| id | amount |
| --- | --- |
| 6 | 176.21 |
| 5 | 21.95 |
| 4 | 29.23 |
| 3 | 148.45 |
| 2 | 183.64 |
| 1 | 185.51 |

---

## Question 2

### Executed SQL Query:
```sql
SELECT id, name FROM users WHERE id > 2 ORDER BY id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM users
|> WHERE id <= 5
|> SELECT id, name
"""

del query

query = """
FROM users
|> WHERE id > 2
|> SELECT id, name
|> ORDER BY id ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option C**

#### Option A *[Distractor]*
*Evaluates the first query which was deleted prior to execution.*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 1 | George Jones |
| 2 | Fiona Williams |
| 3 | Charlie Rodriguez |
| 4 | Fiona Miller |
| 5 | Ian Smith |

#### Option B *[Distractor]*
*Unfiltered data (WHERE clause conditions were not applied).*

**Columns:** `id`, `name` | **Row Count:** `30`

| id | name |
| --- | --- |
| 1 | George Jones |
| 2 | Fiona Williams |
| 3 | Charlie Rodriguez |
| 4 | Fiona Miller |
| 5 | Ian Smith |
| 6 | Alice Johnson |
| 7 | Bob Rodriguez |
| 8 | Evan Smith |
| 9 | Charlie Miller |
| 10 | Ian Garcia |
| 11 | Alice Miller |
| 12 | Alice Martinez |
| 13 | Bob Smith |
| 14 | Ian Smith |
| 15 | Hannah Johnson |
| *... and 15 more rows* | |

#### Option C **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `name` | **Row Count:** `28`

| id | name |
| --- | --- |
| 3 | Charlie Rodriguez |
| 4 | Fiona Miller |
| 5 | Ian Smith |
| 6 | Alice Johnson |
| 7 | Bob Rodriguez |
| 8 | Evan Smith |
| 9 | Charlie Miller |
| 10 | Ian Garcia |
| 11 | Alice Miller |
| 12 | Alice Martinez |
| 13 | Bob Smith |
| 14 | Ian Smith |
| 15 | Hannah Johnson |
| 16 | Julia Garcia |
| 17 | Diana Garcia |
| *... and 13 more rows* | |

#### Option D *[Distractor]*
*Inverted sort order.*

**Columns:** `id`, `name` | **Row Count:** `28`

| id | name |
| --- | --- |
| 30 | Evan Jones |
| 29 | Bob Johnson |
| 28 | Alice Williams |
| 27 | Hannah Davis |
| 26 | Charlie Miller |
| 25 | Alice Davis |
| 24 | Hannah Brown |
| 23 | Diana Williams |
| 22 | George Williams |
| 21 | Ian Johnson |
| 20 | Diana Davis |
| 19 | Evan Garcia |
| 18 | Evan Rodriguez |
| 17 | Diana Garcia |
| 16 | Julia Garcia |
| *... and 13 more rows* | |

---

## Question 3

### Executed SQL Query:
```sql
SELECT AVG(amount) AS avg_amount FROM orders;
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> AGGREGATE AVG(amount) AS avg_amount
"""

formatted_sql = query.replace("WHERE", "").strip()

total_score = (100 * 2) + 50

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Assumes the unexecuted SQL query string is returned as text output.*

**Columns:** `query` | **Row Count:** `1`

| query |
| --- |
| SELECT AVG(amount) AS avg_amount FROM orders; |

#### Option B *[Distractor]*
*Assumes the second host-language arithmetic calculation ((100 * 2) + 50 = 250) is returned.*

**Columns:** `avg_amount` | **Row Count:** `1`

| avg_amount |
| --- |
| 250 |

#### Option C *[Distractor]*
*Assumes the aggregate expression string "AVG(amount)" is returned instead of being calculated.*

**Columns:** `avg_amount` | **Row Count:** `1`

| avg_amount |
| --- |
| AVG(amount) |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `avg_amount` | **Row Count:** `1`

| avg_amount |
| --- |
| 98.70833333333331 |

---

## Question 4

### Executed SQL Query:
```sql
SELECT id, name FROM users WHERE name LIKE 'A%';
```

### Code Snippet Presented to Participant:
```
query = """
FROM users
|> WHERE name LIKE 'A%'
|> SELECT id, name
"""

query.replace("A%", "B%")

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option C**

#### Option A *[Distractor]*
*Evaluates an alternative LIKE pattern (names starting with C).*

**Columns:** `id`, `name` | **Row Count:** `3`

| id | name |
| --- | --- |
| 3 | Charlie Rodriguez |
| 9 | Charlie Miller |
| 26 | Charlie Miller |

#### Option B *[Distractor]*
*Unfiltered table rows without applying the LIKE filter.*

**Columns:** `id`, `name` | **Row Count:** `4`

| id | name |
| --- | --- |
| 1 | George Jones |
| 2 | Fiona Williams |
| 3 | Charlie Rodriguez |
| 4 | Fiona Miller |

#### Option C **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 6 | Alice Johnson |
| 11 | Alice Miller |
| 12 | Alice Martinez |
| 25 | Alice Davis |
| 28 | Alice Williams |

#### Option D *[Distractor]*
*Assumes query.replace("A%", "B%") mutated the query in-place.*

**Columns:** `id`, `name` | **Row Count:** `3`

| id | name |
| --- | --- |
| 7 | Bob Rodriguez |
| 13 | Bob Smith |
| 29 | Bob Johnson |

---

## Question 5

### Executed SQL Query:
```sql
SELECT MIN(score) AS min_score FROM reviews;
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> AGGREGATE AVG(amount) AS avg_amount
"""

str1 = "Review"
str2 = "Score"
combined_text = str1 + str2

query = """
FROM reviews
|> AGGREGATE MIN(score) AS min_score
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `min_score` | **Row Count:** `1`

| min_score |
| --- |
| 1 |

#### Option B *[Distractor]*
*Assumes the aggregate expression string "MIN(score)" is returned instead of the evaluated minimum numeric score.*

**Columns:** `min_score` | **Row Count:** `1`

| min_score |
| --- |
| MIN(score) |

#### Option C *[Distractor]*
*Assumes the host-language string concatenation ("ReviewScore") is returned as the table output.*

**Columns:** `combined_text` | **Row Count:** `1`

| combined_text |
| --- |
| ReviewScore |

#### Option D *[Distractor]*
*Assumes the first unexecuted SQL query string is returned as text output.*

**Columns:** `query` | **Row Count:** `1`

| query |
| --- |
| SELECT AVG(amount) AS avg_amount FROM orders; |

---

## Question 6

### Executed SQL Query:
```sql
SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> WHERE price > 20
|> AGGREGATE MIN(price) AS min_price, MAX(price) AS max_price GROUP BY category_id
|> ORDER BY category_id ASC
"""

result_table = db.execute(query)

sync_checkpoints = ["checkpoint_1", "checkpoint_2"]
sync_progress = 0
for cp in sync_checkpoints:
    sync_progress += 1

query = """
FROM products
|> WHERE price > 35
|> AGGREGATE MAX(price) AS max_price, MIN(price) AS min_price GROUP BY category_id
|> ORDER BY category_id DESC
"""

del query
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option B**

#### Option A *[Distractor]*
*Evaluates query 2 with extra aggregate summary columns (item_count, avg_price) sorted by category_id DESC.*

**Columns:** `category_id`, `max_price`, `min_price`, `item_count`, `avg_price` | **Row Count:** `16`

| category_id | max_price | min_price | item_count | avg_price |
| --- | --- | --- | --- | --- |
| 30 | 176.9 | 176.9 | 1 | 176.9 |
| 29 | 137.24 | 108.67 | 2 | 122.96 |
| 25 | 172.4 | 172.4 | 1 | 172.4 |
| 21 | 117.2 | 114.2 | 2 | 115.7 |
| 20 | 196.19 | 196.19 | 1 | 196.19 |
| 19 | 143.3 | 143.3 | 1 | 143.3 |
| 18 | 163.71 | 67.4 | 2 | 115.56 |
| 16 | 98.81 | 98.81 | 1 | 98.81 |
| 15 | 147.41 | 114.27 | 3 | 130.94 |
| 14 | 141.2 | 141.2 | 1 | 141.2 |
| 11 | 171.62 | 171.62 | 1 | 171.62 |
| 10 | 138.58 | 35.32 | 5 | 87.05 |
| 9 | 138.86 | 138.86 | 1 | 138.86 |
| 5 | 166.52 | 110.14 | 2 | 138.33 |
| 3 | 106.31 | 91.08 | 2 | 98.7 |
| *... and 1 more rows* | | | | |

#### Option B **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `category_id`, `min_price`, `max_price` | **Row Count:** `16`

| category_id | min_price | max_price |
| --- | --- | --- |
| 2 | 50.94 | 50.94 |
| 3 | 91.08 | 106.31 |
| 5 | 32.83 | 166.52 |
| 9 | 138.86 | 138.86 |
| 10 | 35.32 | 138.58 |
| 11 | 171.62 | 171.62 |
| 14 | 141.2 | 141.2 |
| 15 | 114.27 | 147.41 |
| 16 | 20.62 | 98.81 |
| 18 | 67.4 | 163.71 |
| 19 | 143.3 | 143.3 |
| 20 | 31.97 | 196.19 |
| 21 | 114.2 | 117.2 |
| 25 | 172.4 | 172.4 |
| 29 | 108.67 | 137.24 |
| *... and 1 more rows* | | |

#### Option C *[Distractor]*
*Evaluates unfiltered MIN/MAX with an extra product_count column sorted by min_price DESC.*

**Columns:** `category_id`, `min_price`, `max_price`, `product_count` | **Row Count:** `16`

| category_id | min_price | max_price | product_count |
| --- | --- | --- | --- |
| 30 | 176.9 | 176.9 | 1 |
| 25 | 172.4 | 172.4 | 1 |
| 11 | 171.62 | 171.62 | 1 |
| 19 | 143.3 | 143.3 | 1 |
| 14 | 141.2 | 141.2 | 1 |
| 9 | 138.86 | 138.86 | 1 |
| 15 | 114.27 | 147.41 | 3 |
| 21 | 114.2 | 117.2 | 2 |
| 29 | 108.67 | 137.24 | 2 |
| 3 | 91.08 | 106.31 | 2 |
| 18 | 67.4 | 163.71 | 2 |
| 2 | 50.94 | 50.94 | 1 |
| 10 | 35.32 | 138.58 | 5 |
| 5 | 32.83 | 166.52 | 3 |
| 20 | 31.97 | 196.19 | 2 |
| *... and 1 more rows* | | | |

#### Option D *[Distractor]*
*Evaluates query 1 with extra inventory and rating columns (total_stock, avg_rating) sorted by total_stock DESC.*

**Columns:** `category_id`, `min_price`, `max_price`, `total_stock`, `avg_rating` | **Row Count:** `16`

| category_id | min_price | max_price | total_stock | avg_rating |
| --- | --- | --- | --- | --- |
| 15 | 114.27 | 147.41 | 229 | 3.4 |
| 21 | 114.2 | 117.2 | 195 | 3 |
| 10 | 35.32 | 138.58 | 190 | 2.6 |
| 29 | 108.67 | 137.24 | 167 | 4 |
| 18 | 67.4 | 163.71 | 129 | 2.9 |
| 3 | 91.08 | 106.31 | 119 | 2.7 |
| 5 | 32.83 | 166.52 | 111 | 3.1 |
| 20 | 31.97 | 196.19 | 89 | 2.2 |
| 25 | 172.4 | 172.4 | 86 | 3.4 |
| 30 | 176.9 | 176.9 | 85 | 4 |
| 2 | 50.94 | 50.94 | 71 | 3.3 |
| 16 | 20.62 | 98.81 | 56 | 2 |
| 11 | 171.62 | 171.62 | 54 | 1.8 |
| 14 | 141.2 | 141.2 | 35 | 4.8 |
| 9 | 138.86 | 138.86 | 23 | 1.7 |
| *... and 1 more rows* | | | | |

---

## Question 7

### Executed SQL Query:
```sql
SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> WHERE price > 20
|> AGGREGATE ROUND(SUM(price), 2) AS sum_price GROUP BY category_id
|> ORDER BY category_id ASC
"""

result_table = db.execute(query)

query_clauses = ["SELECT", "WHERE", "GROUP BY"]
active_clauses = [c for c in query_clauses if c in query]

query = """
UPDATE products SET price = price * 2;
"""
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Evaluates unnecessary additional columns (item_count, avg_price).*

**Columns:** `category_id`, `sum_price`, `item_count`, `avg_price` | **Row Count:** `15`

| category_id | sum_price | item_count | avg_price |
| --- | --- | --- | --- |
| 1 | 66.52 | 1 | 66.52 |
| 7 | 323.1 | 3 | 107.7 |
| 12 | 136.91 | 1 | 136.91 |
| 13 | 334.7 | 2 | 167.35 |
| 15 | 265.67 | 2 | 132.84 |
| 16 | 48.62 | 1 | 48.62 |
| 17 | 128.92 | 1 | 128.92 |
| 19 | 87.27 | 1 | 87.27 |
| 21 | 314.9 | 4 | 78.73 |
| 22 | 160.42 | 1 | 160.42 |
| 23 | 333.99 | 2 | 167 |
| 24 | 223.86 | 2 | 111.93 |
| 26 | 244.08 | 2 | 122.04 |
| 27 | 200.78 | 2 | 100.39 |
| 29 | 267.49 | 2 | 133.75 |

#### Option B *[Distractor]*
*Inverted sort order for query 1 (DESC instead of ASC).*

**Columns:** `category_id`, `sum_price` | **Row Count:** `15`

| category_id | sum_price |
| --- | --- |
| 29 | 267.49 |
| 27 | 200.78 |
| 26 | 244.08 |
| 24 | 223.86 |
| 23 | 333.99 |
| 22 | 160.42 |
| 21 | 314.9 |
| 19 | 87.27 |
| 17 | 128.92 |
| 16 | 48.62 |
| 15 | 265.67 |
| 13 | 334.7 |
| 12 | 136.91 |
| 7 | 323.1 |
| 1 | 66.52 |

#### Option C *[Distractor]*
*Evaluates the item count (COUNT) instead of the total price (SUM).*

**Columns:** `category_id`, `item_count` | **Row Count:** `15`

| category_id | item_count |
| --- | --- |
| 1 | 1 |
| 7 | 3 |
| 12 | 1 |
| 13 | 2 |
| 15 | 2 |
| 16 | 1 |
| 17 | 1 |
| 19 | 1 |
| 21 | 4 |
| 22 | 1 |
| 23 | 2 |
| 24 | 2 |
| 26 | 2 |
| 27 | 2 |
| 29 | 2 |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `category_id`, `sum_price` | **Row Count:** `15`

| category_id | sum_price |
| --- | --- |
| 1 | 66.52 |
| 7 | 323.1 |
| 12 | 136.91 |
| 13 | 334.7 |
| 15 | 265.67 |
| 16 | 48.62 |
| 17 | 128.92 |
| 19 | 87.27 |
| 21 | 314.9 |
| 22 | 160.42 |
| 23 | 333.99 |
| 24 | 223.86 |
| 26 | 244.08 |
| 27 | 200.78 |
| 29 | 267.49 |

---

## Question 8

### Executed SQL Query:
```sql
SELECT id, name FROM users WHERE id <= 5 ORDER BY name ASC;
```

### Code Snippet Presented to Participant:
```
def append_to_query(clause):
    log_buffer = ["audit_marker"]
    log_buffer.append(clause)
    return len(log_buffer)

query = """
FROM users
|> WHERE id <= 5
|> SELECT id, name
|> ORDER BY name ASC
"""

append_status = append_to_query("ORDER BY id DESC")

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 4 | Bob Garcia |
| 2 | Charlie Davis |
| 3 | Fiona Jones |
| 1 | George Martinez |
| 5 | Hannah Smith |

#### Option B *[Distractor]*
*Evaluates an alternative filter range (ids 6 to 10).*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 6 | Alice Rodriguez |
| 8 | Bob Miller |
| 7 | Fiona Garcia |
| 9 | Hannah Miller |
| 10 | Hannah Smith |

#### Option C *[Distractor]*
*Assumes rows are sorted by id ASC instead of name ASC.*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 1 | George Martinez |
| 2 | Charlie Davis |
| 3 | Fiona Jones |
| 4 | Bob Garcia |
| 5 | Hannah Smith |

#### Option D *[Distractor]*
*Assumes the append function call modified the query to sort by id DESC.*

**Columns:** `id`, `name` | **Row Count:** `5`

| id | name |
| --- | --- |
| 5 | Hannah Smith |
| 4 | Bob Garcia |
| 3 | Fiona Jones |
| 2 | Charlie Davis |
| 1 | George Martinez |

---

## Question 9

### Executed SQL Query:
```sql
SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM reviews GROUP BY order_id ORDER BY order_id DESC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM reviews
|> AGGREGATE SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score GROUP BY order_id
|> ORDER BY order_id ASC
"""

query = query.replace("ASC", "DESC")

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Assumes the query was sorted by total_score DESC with an extra min_score column.*

**Columns:** `order_id`, `total_score`, `avg_score`, `min_score` | **Row Count:** `7`

| order_id | total_score | avg_score | min_score |
| --- | --- | --- | --- |
| 1 | 21 | 2.63 | 1 |
| 2 | 17 | 4.25 | 4 |
| 4 | 15 | 3 | 1 |
| 6 | 11 | 2.75 | 1 |
| 8 | 9 | 1.8 | 1 |
| 7 | 9 | 3 | 2 |
| 3 | 2 | 2 | 2 |

#### Option B *[Distractor]*
*Evaluates item_count and max_score sorted by item_count DESC.*

**Columns:** `order_id`, `item_count`, `avg_score`, `max_score` | **Row Count:** `7`

| order_id | item_count | avg_score | max_score |
| --- | --- | --- | --- |
| 1 | 8 | 2.63 | 5 |
| 8 | 5 | 1.8 | 3 |
| 4 | 5 | 3 | 5 |
| 6 | 4 | 2.75 | 5 |
| 2 | 4 | 4.25 | 5 |
| 7 | 3 | 3 | 4 |
| 3 | 1 | 2 | 2 |

#### Option C *[Distractor]*
*Evaluates the initial query (ordered by order_id ASC), assuming the HLL string rewrite to DESC was not applied.*

**Columns:** `order_id`, `total_score`, `avg_score` | **Row Count:** `7`

| order_id | total_score | avg_score |
| --- | --- | --- |
| 1 | 21 | 2.63 |
| 2 | 17 | 4.25 |
| 3 | 2 | 2 |
| 4 | 15 | 3 |
| 6 | 11 | 2.75 |
| 7 | 9 | 3 |
| 8 | 9 | 1.8 |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `order_id`, `total_score`, `avg_score` | **Row Count:** `7`

| order_id | total_score | avg_score |
| --- | --- | --- |
| 8 | 9 | 1.8 |
| 7 | 9 | 3 |
| 6 | 11 | 2.75 |
| 4 | 15 | 3 |
| 3 | 2 | 2 |
| 2 | 17 | 4.25 |
| 1 | 21 | 2.63 |

---

## Question 10

### Executed SQL Query:
```sql
SELECT orders.id AS order_id FROM orders ORDER BY orders.id ASC;
```

### Code Snippet Presented to Participant:
```
orders_quantity = [15, 8, 22, 5, 12, 30]
products_id = [1, 2, 3]
orders_count = len(orders_quantity)
products_count = len(products_id)

if orders_count >= products_count:
    query = """
FROM orders
|> SELECT orders.id AS order_id
|> ORDER BY order_id ASC
"""
else:
    query = """
FROM products
|> ORDER BY id ASC
|> SELECT products.title AS product_name
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `order_id` | **Row Count:** `30`

| order_id |
| --- |
| 1 |
| 2 |
| 3 |
| 4 |
| 5 |
| 6 |
| 7 |
| 8 |
| 9 |
| 10 |
| 11 |
| 12 |
| 13 |
| 14 |
| 15 |
| *... and 15 more rows* | |

#### Option B *[Distractor]*
*Outputs the order quantities instead of the order IDs.*

**Columns:** `quantity` | **Row Count:** `30`

| quantity |
| --- |
| 68 |
| 81 |
| 8 |
| 2 |
| 62 |
| 46 |
| 84 |
| 20 |
| 50 |
| 27 |
| 59 |
| 74 |
| 78 |
| 33 |
| 95 |
| *... and 15 more rows* | |

#### Option C *[Distractor]*
*Assumes the count of products ID was strictly greater than orders quantity, which would output all product names.*

**Columns:** `product_name` | **Row Count:** `30`

| product_name |
| --- |
| Smartwatch |
| Keyboard |
| Camera |
| Mouse |
| Monitor |
| Monitor |
| Mouse |
| Laptop |
| Monitor |
| Laptop |
| Camera |
| Camera |
| Smartphone |
| Monitor |
| Camera |
| *... and 15 more rows* | |

#### Option D *[Distractor]*
*Outputs the numeric count value instead of selecting the table rows.*

**Columns:** `total_count` | **Row Count:** `1`

| total_count |
| --- |
| 30 |

---

## Question 11

### Executed SQL Query:
```sql
SELECT products.id, products.title, categories.name AS category_name, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 5 ORDER BY products.id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> JOIN categories ON products.category_id = categories.id
|> WHERE products.id <= 5
|> SELECT products.id, products.title, categories.name AS category_name, products.price
|> ORDER BY id ASC
"""

col_title = "title"
col_category = "category_name"
col_status = "status"
col_notes = "notes"

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Evaluates the JOIN result but omits the joined category_name column.*

**Columns:** `id`, `title`, `price` | **Row Count:** `5`

| id | title | price |
| --- | --- | --- |
| 1 | Smartwatch | 77.28 |
| 2 | Keyboard | 87.28 |
| 3 | Camera | 77.59 |
| 4 | Mouse | 87.27 |
| 5 | Monitor | 136.1 |

#### Option B *[Distractor]*
*Evaluates the JOIN result with an extra category_id foreign key column.*

**Columns:** `id`, `title`, `category_id`, `category_name`, `price` | **Row Count:** `5`

| id | title | category_id | category_name | price |
| --- | --- | --- | --- | --- |
| 1 | Smartwatch | 26 | Charlie Brown | 77.28 |
| 2 | Keyboard | 21 | Bob Garcia | 87.28 |
| 3 | Camera | 29 | Fiona Brown | 77.59 |
| 4 | Mouse | 19 | Diana Smith | 87.27 |
| 5 | Monitor | 21 | Bob Garcia | 136.1 |

#### Option C *[Distractor]*
*Evaluates the JOIN result with an extra stock inventory column.*

**Columns:** `id`, `title`, `category_name`, `stock`, `price` | **Row Count:** `5`

| id | title | category_name | stock | price |
| --- | --- | --- | --- | --- |
| 1 | Smartwatch | Charlie Brown | 73 | 77.28 |
| 2 | Keyboard | Bob Garcia | 70 | 87.28 |
| 3 | Camera | Fiona Brown | 69 | 77.59 |
| 4 | Mouse | Diana Smith | 40 | 87.27 |
| 5 | Monitor | Bob Garcia | 27 | 136.1 |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `title`, `category_name`, `price` | **Row Count:** `5`

| id | title | category_name | price |
| --- | --- | --- | --- |
| 1 | Smartwatch | Charlie Brown | 77.28 |
| 2 | Keyboard | Bob Garcia | 87.28 |
| 3 | Camera | Fiona Brown | 77.59 |
| 4 | Mouse | Diana Smith | 87.27 |
| 5 | Monitor | Bob Garcia | 136.1 |

---

## Question 12

### Executed SQL Query:
```sql
SELECT orders.id, users.name, orders.amount
FROM orders
JOIN users ON orders.user_id = users.id
WHERE orders.amount > 100
UNION
SELECT orders.id, users.name, orders.amount
FROM orders
JOIN users ON orders.user_id = users.id
WHERE orders.status = 'COMPLETED';
```

### Code Snippet Presented to Participant:
```
status_codes = [200, 201, 204]
valid_count = 0
for code in status_codes:
    valid_count += 1

query = """
FROM orders
|> JOIN users ON orders.user_id = users.id
|> WHERE orders.amount > 100
|> SELECT orders.id, users.name, orders.amount
|> UNION DISTINCT (
  FROM orders
  |> JOIN users ON orders.user_id = users.id
  |> WHERE orders.status = 'COMPLETED'
  |> SELECT orders.id, users.name, orders.amount
)
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option C**

#### Option A *[Distractor]*
*Evaluates the joined UNION statement with an additional status column included in the projection.*

**Columns:** `id`, `name`, `amount`, `status` | **Row Count:** `16`

| id | name | amount | status |
| --- | --- | --- | --- |
| 1 | Fiona Garcia | 184.21 | PENDING |
| 2 | Alice Rodriguez | 176.79 | PENDING |
| 3 | Charlie Martinez | 140.06 | SHIPPED |
| 4 | Charlie Brown | 192.2 | COMPLETED |
| 5 | Charlie Davis | 163.31 | REFUNDED |
| 7 | Hannah Miller | 167.39 | SHIPPED |
| 9 | Fiona Martinez | 165.36 | PENDING |
| 11 | Diana Miller | 200.93 | REFUNDED |
| 12 | George Martinez | 202 | PENDING |
| 15 | George Martinez | 143.35 | SHIPPED |
| 16 | Fiona Jones | 85.33 | COMPLETED |
| 17 | Julia Martinez | 107.35 | SHIPPED |
| 18 | Hannah Smith | 116.47 | PENDING |
| 20 | Bob Rodriguez | 174.38 | SHIPPED |
| 21 | Fiona Garcia | 142.28 | PENDING |
| *... and 1 more rows* | | | |

#### Option B *[Distractor]*
*Evaluates only the second query in the compound UNION statement (orders with status = 'COMPLETED').*

**Columns:** `id`, `name`, `amount` | **Row Count:** `3`

| id | name | amount |
| --- | --- | --- |
| 4 | Charlie Brown | 192.2 |
| 16 | Fiona Jones | 85.33 |
| 30 | Fiona Jones | 186.83 |

#### Option C **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `name`, `amount` | **Row Count:** `16`

| id | name | amount |
| --- | --- | --- |
| 1 | Fiona Garcia | 184.21 |
| 2 | Alice Rodriguez | 176.79 |
| 3 | Charlie Martinez | 140.06 |
| 4 | Charlie Brown | 192.2 |
| 5 | Charlie Davis | 163.31 |
| 7 | Hannah Miller | 167.39 |
| 9 | Fiona Martinez | 165.36 |
| 11 | Diana Miller | 200.93 |
| 12 | George Martinez | 202 |
| 15 | George Martinez | 143.35 |
| 16 | Fiona Jones | 85.33 |
| 17 | Julia Martinez | 107.35 |
| 18 | Hannah Smith | 116.47 |
| 20 | Bob Rodriguez | 174.38 |
| 21 | Fiona Garcia | 142.28 |
| *... and 1 more rows* | | |

#### Option D *[Distractor]*
*Evaluates only the first query in the compound UNION statement (orders with amount > 100).*

**Columns:** `id`, `name`, `amount` | **Row Count:** `15`

| id | name | amount |
| --- | --- | --- |
| 1 | Fiona Garcia | 184.21 |
| 2 | Alice Rodriguez | 176.79 |
| 3 | Charlie Martinez | 140.06 |
| 4 | Charlie Brown | 192.2 |
| 5 | Charlie Davis | 163.31 |
| 7 | Hannah Miller | 167.39 |
| 9 | Fiona Martinez | 165.36 |
| 11 | Diana Miller | 200.93 |
| 12 | George Martinez | 202 |
| 15 | George Martinez | 143.35 |
| 17 | Julia Martinez | 107.35 |
| 18 | Hannah Smith | 116.47 |
| 20 | Bob Rodriguez | 174.38 |
| 21 | Fiona Garcia | 142.28 |
| 30 | Fiona Jones | 186.83 |

---

## Question 13

### Executed SQL Query:
```sql
SELECT products.id, products.title, products.price FROM products WHERE products.id <= 3 ORDER BY products.id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> WHERE amount > 15
|> AGGREGATE SUM(amount) AS sum_amt, AVG(amount) AS avg_amt
"""

query = query.replace("orders", "users")
query = query.replace("amount > 15", "id <= 3")
query = query.replace("SUM(amount) AS sum_amt, AVG(amount) AS avg_amt", "id, name, rating")

query = """
FROM products
|> WHERE products.id <= 3
|> SELECT products.id, products.title, products.price
|> ORDER BY id ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `title`, `price` | **Row Count:** `3`

| id | title | price |
| --- | --- | --- |
| 1 | Tablet | 47.84 |
| 2 | Tablet | 39.93 |
| 3 | Camera | 55.64 |

#### Option B *[Distractor]*
*Assumes the initial aggregation query on orders was executed before it was modified and overridden.*

**Columns:** `sum_amt`, `avg_amt` | **Row Count:** `1`

| sum_amt | avg_amt |
| --- | --- |
| 3148.149999999999 | 116.59814814814811 |

#### Option C *[Distractor]*
*Evaluates an alternative product ID range (IDs 4 to 6 instead of 1 to 3).*

**Columns:** `id`, `title`, `price` | **Row Count:** `3`

| id | title | price |
| --- | --- | --- |
| 4 | Tablet | 157.64 |
| 5 | Camera | 133.63 |
| 6 | Smartwatch | 61 |

#### Option D *[Distractor]*
*Assumes the host language string manipulation on query was executed instead of the second query.*

**Columns:** `id`, `name`, `rating` | **Row Count:** `3`

| id | name | rating |
| --- | --- | --- |
| 1 | Diana Smith | 3.52 |
| 2 | Fiona Williams | 4.76 |
| 3 | Diana Miller | 4.11 |

---

## Question 14

### Executed SQL Query:
```sql
SELECT orders.status, ROUND(SUM(orders.amount), 2) AS rounded_total FROM orders WHERE orders.status LIKE 'COMP%' GROUP BY orders.status;
```

### Code Snippet Presented to Participant:
```
status_checks = ["PENDING", "COMPLETED"]
like_match = "status LIKE 'COMP%'"
sum_amount = sum([120.45, 80.55])
round_target = round(sum_amount, 2)

query = """
FROM orders
|> WHERE orders.status LIKE 'COMP%'
|> AGGREGATE ROUND(SUM(orders.amount), 2) AS rounded_total GROUP BY orders.status
"""

group_status = "PENDING"
amount_sum = sum([45.20, 54.80])
rounded_total = round(amount_sum, 2)

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option B**

#### Option A *[Distractor]*
*Assumes the host language variable group_status = 'PENDING' or status LIKE 'COMP%' matched 'PENDING'.*

**Columns:** `status`, `rounded_total` | **Row Count:** `1`

| status | rounded_total |
| --- | --- |
| PENDING | 533.62 |

#### Option B **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `status`, `rounded_total` | **Row Count:** `1`

| status | rounded_total |
| --- | --- |
| COMPLETED | 440.09 |

#### Option C *[Distractor]*
*Projects user_id instead of the grouped status column.*

**Columns:** `user_id`, `rounded_total` | **Row Count:** `1`

| user_id | rounded_total |
| --- | --- |
| 7 | 200.14 |

#### Option D *[Distractor]*
*Computes the average (AVG) per order instead of the total rounded sum (SUM).*

**Columns:** `status`, `avg_amount` | **Row Count:** `1`

| status | avg_amount |
| --- | --- |
| COMPLETED | 88.02 |

---

## Question 15

### Executed SQL Query:
```sql
SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status ORDER BY order_count DESC, status DESC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> WHERE amount > 50
|> SELECT id, amount, status
"""

db.execute(query)

filters = ["status = 'COMPLETED'", "amount > 20"]
query = query.replace("WHERE amount > 50", "WHERE " + " AND ".join(filters))
query = query + "\n|> ORDER BY amount DESC"

query = """
FROM orders
|> AGGREGATE COUNT(*) AS order_count GROUP BY status
|> ORDER BY order_count DESC, status DESC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `status`, `order_count` | **Row Count:** `5`

| status | order_count |
| --- | --- |
| REFUNDED | 9 |
| CANCELLED | 8 |
| COMPLETED | 5 |
| SHIPPED | 4 |
| PENDING | 4 |

#### Option B *[Distractor]*
*Evaluates SUM(amount) instead of COUNT(*).*

**Columns:** `status`, `order_count` | **Row Count:** `5`

| status | order_count |
| --- | --- |
| REFUNDED | 979.2 |
| CANCELLED | 792.5 |
| PENDING | 533.6 |
| COMPLETED | 440.1 |
| SHIPPED | 429.3 |

#### Option C *[Distractor]*
*Evaluates the first query before modification.*

**Columns:** `status`, `order_count` | **Row Count:** `23`

| status | order_count |
| --- | --- |
| 1 | 114.38 |
| 2 | 99.02 |
| 4 | 144.42 |
| 6 | 59.42 |
| 7 | 199 |
| 8 | 153.03 |
| 9 | 130.44 |
| 10 | 71.68 |
| 11 | 202.98 |
| 12 | 140.49 |
| 13 | 82.45 |
| 14 | 185.55 |
| 15 | 138.91 |
| 19 | 93.44 |
| 20 | 67.05 |
| *... and 8 more rows* | |

#### Option D *[Distractor]*
*Inverted sort order for the executed query (ASC instead of DESC).*

**Columns:** `status`, `order_count` | **Row Count:** `5`

| status | order_count |
| --- | --- |
| PENDING | 4 |
| SHIPPED | 4 |
| COMPLETED | 5 |
| CANCELLED | 8 |
| REFUNDED | 9 |

---

## Question 16

### Executed SQL Query:
```sql
SELECT users.name, users.age, users.is_active, SUM(orders.amount) AS total_spent, COUNT(reviews.id) AS review_count FROM users JOIN orders ON orders.user_id = users.id JOIN reviews ON reviews.order_id = orders.id GROUP BY users.name, users.age, users.is_active ORDER BY users.name ASC LIMIT 3;
```

### Code Snippet Presented to Participant:
```
def append_order_quantity(q):
    return q.replace("review_count", "review_count, SUM(orders.quantity) AS total_quantity")

query = """
FROM users
|> JOIN orders ON orders.user_id = users.id
|> JOIN reviews ON reviews.order_id = orders.id
|> AGGREGATE SUM(orders.amount) AS total_spent, COUNT(reviews.id) AS review_count GROUP BY users.name, users.age, users.is_active
|> ORDER BY name ASC
|> LIMIT 3
"""

audit_trail = ["orders_joined", "reviews_joined"]
verified_joins = len(audit_trail)

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option B**

#### Option A *[Distractor]*
*Assumes append_order_quantity(q) was executed, adding total_quantity to the output.*

**Columns:** `name`, `age`, `is_active`, `total_spent`, `review_count`, `total_quantity` | **Row Count:** `3`

| name | age | is_active | total_spent | review_count | total_quantity |
| --- | --- | --- | --- | --- | --- |
| Charlie Davis | 62 | 0 | 457.52 | 4 | 180 |
| Diana Johnson | 19 | 1 | 1030.26 | 6 | 564 |
| Diana Martinez | 19 | 0 | 594.12 | 6 | 516 |

#### Option B **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `name`, `age`, `is_active`, `total_spent`, `review_count` | **Row Count:** `3`

| name | age | is_active | total_spent | review_count |
| --- | --- | --- | --- | --- |
| Charlie Davis | 62 | 0 | 457.52 | 4 |
| Diana Johnson | 19 | 1 | 1030.26 | 6 |
| Diana Martinez | 19 | 0 | 594.12 | 6 |

#### Option C *[Distractor]*
*Computes the average order amount (avg_spent) instead of the total spent (total_spent).*

**Columns:** `name`, `age`, `is_active`, `avg_spent`, `review_count` | **Row Count:** `3`

| name | age | is_active | avg_spent | review_count |
| --- | --- | --- | --- | --- |
| Charlie Davis | 62 | 0 | 114.38 | 4 |
| Diana Johnson | 19 | 1 | 171.71 | 6 |
| Diana Martinez | 19 | 0 | 99.02 | 6 |

#### Option D *[Distractor]*
*Omits the reviews table join and review_count aggregate column.*

**Columns:** `name`, `age`, `is_active`, `total_spent` | **Row Count:** `3`

| name | age | is_active | total_spent |
| --- | --- | --- | --- |
| Alice Garcia | 34 | 1 | 82.45 |
| Charlie Davis | 62 | 0 | 114.38 |
| Charlie Smith | 52 | 1 | 202.98 |

---

## Question 17

### Executed SQL Query:
```sql
SELECT order_count, COUNT(*) AS user_count FROM (SELECT orders.user_id, COUNT(*) AS order_count FROM orders GROUP BY orders.user_id) sub GROUP BY order_count ORDER BY order_count ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> AGGREGATE COUNT(*) AS order_count GROUP BY orders.user_id
"""

group_passes = query.count("GROUP BY")
requires_nested_agg = "subquery" in query or "sub" in query

query = """
FROM orders
|> AGGREGATE COUNT(*) AS order_count GROUP BY orders.user_id
|> AGGREGATE COUNT(*) AS user_count GROUP BY order_count
|> ORDER BY order_count ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option C**

#### Option A *[Distractor]*
*Projects user_id instead of the outer group column order_count with user_count.*

**Columns:** `user_id`, `user_count` | **Row Count:** `4`

| user_id | user_count |
| --- | --- |
| 1 | 12 |
| 2 | 5 |
| 3 | 1 |
| 4 | 1 |

#### Option B *[Distractor]*
*Sums the order counts (SUM(order_count)) rather than counting distinct users having each order count.*

**Columns:** `order_count`, `total_orders` | **Row Count:** `4`

| order_count | total_orders |
| --- | --- |
| 1 | 12 |
| 2 | 10 |
| 3 | 3 |
| 5 | 5 |

#### Option C **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `order_count`, `user_count` | **Row Count:** `4`

| order_count | user_count |
| --- | --- |
| 1 | 12 |
| 2 | 5 |
| 3 | 1 |
| 5 | 1 |

#### Option D *[Distractor]*
*Evaluates the first query before it was overwritten, grouping orders by user_id instead of the nested aggregation.*

**Columns:** `user_id`, `order_count` | **Row Count:** `4`

| user_id | order_count |
| --- | --- |
| 7 | 5 |
| 20 | 3 |
| 24 | 2 |
| 22 | 2 |

---

## Question 18

### Executed SQL Query:
```sql
SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM orders WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent DESC LIMIT 3;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> AGGREGATE MAX(price) AS price, SUM(stock) AS stock GROUP BY title
|> ORDER BY title ASC
|> LIMIT 3
"""

if "price" in query:
    query.replace("price", "category_id")
    query_audit = query + " -- verified filter"

queryy = """
FROM orders
|> WHERE amount >= 25 AND status != 'CANCELLED'
|> AGGREGATE COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order GROUP BY user_id
|> ORDER BY total_spent DESC
|> LIMIT 3
"""

result_table = db.execute(queryy)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Assumes ascending sort order (ORDER BY total_spent ASC) instead of descending (DESC), returning the lowest spenders first.*

**Columns:** `user_id`, `order_count`, `total_spent`, `avg_amount`, `max_order` | **Row Count:** `3`

| user_id | order_count | total_spent | avg_amount | max_order |
| --- | --- | --- | --- | --- |
| 12 | 1 | 28.52 | 28.52 | 28.52 |
| 15 | 1 | 42.83 | 42.83 | 42.83 |
| 22 | 1 | 67.05 | 67.05 | 67.05 |

#### Option B *[Distractor]*
*Assumes query was executed instead of queryy, producing the aggregated price and stock grouped by title.*

**Columns:** `title`, `price`, `stock` | **Row Count:** `3`

| title | price | stock |
| --- | --- | --- |
| Camera | 133.63 | 355 |
| Headphones | 163.12 | 99 |
| Keyboard | 193.9 | 6 |

#### Option C *[Distractor]*
*Assumes the string replacement query.replace("price", "category_id") mutated query in-place.*

**Columns:** `title`, `category_id`, `stock` | **Row Count:** `3`

| title | category_id | stock |
| --- | --- | --- |
| Camera | 18 | 355 |
| Headphones | 5 | 99 |
| Keyboard | 12 | 6 |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `user_id`, `order_count`, `total_spent`, `avg_amount`, `max_order` | **Row Count:** `3`

| user_id | order_count | total_spent | avg_amount | max_order |
| --- | --- | --- | --- | --- |
| 7 | 5 | 499.82 | 99.96 | 185.55 |
| 20 | 3 | 488.43 | 162.81 | 185.28 |
| 10 | 1 | 202.98 | 202.98 | 202.98 |

---

## Question 19

### Executed SQL Query:
```sql
SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM products WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY avg_price DESC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> WHERE price > 15
|> AGGREGATE COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price GROUP BY category_id, stock
|> ORDER BY avg_price DESC
"""

extra_filter = "stock > 20"

if "WHERE" in query:
    query = query.replace("price > 15", f"price > 15 AND {extra_filter}")
else:
    query = query.replace("|> AGGREGATE", f"|> WHERE {extra_filter}\n|> AGGREGATE")

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option D**

#### Option A *[Distractor]*
*Orders rows by stock descending (ORDER BY stock DESC) instead of average price descending.*

**Columns:** `category_id`, `stock`, `count_items`, `avg_price` | **Row Count:** `25`

| category_id | stock | count_items | avg_price |
| --- | --- | --- | --- |
| 10 | 97 | 1 | 92.19 |
| 15 | 97 | 1 | 80.76 |
| 17 | 88 | 1 | 141.93 |
| 14 | 86 | 1 | 34.24 |
| 9 | 78 | 1 | 35.13 |
| 14 | 76 | 1 | 81.05 |
| 6 | 73 | 1 | 101.5 |
| 28 | 73 | 1 | 127.91 |
| 28 | 71 | 1 | 176.69 |
| 15 | 59 | 1 | 195.18 |
| 14 | 56 | 1 | 162.33 |
| 26 | 56 | 1 | 24.67 |
| 13 | 55 | 1 | 73.93 |
| 1 | 47 | 1 | 71.8 |
| 7 | 47 | 1 | 199.45 |
| *... and 10 more rows* | | | |

#### Option B *[Distractor]*
*Evaluates the initial query grouped by category_id (ordered by avg_price DESC), omitting the stock column and assuming the host language filter injection was not applied.*

**Columns:** `category_id`, `count_items`, `avg_price` | **Row Count:** `15`

| category_id | count_items | avg_price |
| --- | --- | --- |
| 16 | 2 | 185.57 |
| 7 | 2 | 155.93 |
| 28 | 2 | 152.3 |
| 25 | 1 | 148.75 |
| 15 | 3 | 143.28 |
| 17 | 1 | 141.93 |
| 12 | 4 | 135.95 |
| 6 | 2 | 101.76 |
| 23 | 2 | 99.33 |
| 14 | 3 | 92.54 |
| 10 | 1 | 92.19 |
| 13 | 1 | 73.93 |
| 1 | 1 | 71.8 |
| 9 | 1 | 35.13 |
| 26 | 1 | 24.67 |

#### Option C *[Distractor]*
*Orders category groups in ascending order (ORDER BY avg_price ASC) instead of descending order.*

**Columns:** `category_id`, `stock`, `count_items`, `avg_price` | **Row Count:** `25`

| category_id | stock | count_items | avg_price |
| --- | --- | --- | --- |
| 26 | 56 | 1 | 24.67 |
| 14 | 86 | 1 | 34.24 |
| 9 | 78 | 1 | 35.13 |
| 23 | 21 | 1 | 38.81 |
| 1 | 47 | 1 | 71.8 |
| 13 | 55 | 1 | 73.93 |
| 15 | 97 | 1 | 80.76 |
| 14 | 76 | 1 | 81.05 |
| 10 | 97 | 1 | 92.19 |
| 6 | 73 | 1 | 101.5 |
| 6 | 22 | 1 | 102.02 |
| 7 | 36 | 1 | 112.41 |
| 28 | 73 | 1 | 127.91 |
| 12 | 41 | 1 | 130.03 |
| 17 | 88 | 1 | 141.93 |
| *... and 10 more rows* | | | |

#### Option D **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `category_id`, `stock`, `count_items`, `avg_price` | **Row Count:** `25`

| category_id | stock | count_items | avg_price |
| --- | --- | --- | --- |
| 16 | 27 | 1 | 201.69 |
| 7 | 47 | 1 | 199.45 |
| 15 | 59 | 1 | 195.18 |
| 28 | 71 | 1 | 176.69 |
| 16 | 42 | 1 | 169.45 |
| 14 | 56 | 1 | 162.33 |
| 23 | 23 | 1 | 159.85 |
| 15 | 34 | 1 | 153.89 |
| 12 | 27 | 1 | 144.68 |
| 12 | 23 | 1 | 143.29 |
| 17 | 88 | 1 | 141.93 |
| 12 | 41 | 1 | 130.03 |
| 28 | 73 | 1 | 127.91 |
| 7 | 36 | 1 | 112.41 |
| 6 | 22 | 1 | 102.02 |
| *... and 10 more rows* | | | |

---

## Question 20

### Executed SQL Query:
```sql
SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM orders WHERE amount >= 180 GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;
```

### Code Snippet Presented to Participant:
```
min_amount = 180

query = f"""
FROM orders
|> WHERE amount >= {min_amount}
|> AGGREGATE COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent GROUP BY user_id
|> ORDER BY total_spent DESC
|> LIMIT 4
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `user_id`, `order_count`, `total_spent` | **Row Count:** `2`

| user_id | order_count | total_spent |
| --- | --- | --- |
| 29 | 1 | 193.65 |
| 19 | 1 | 186.25 |

#### Option B *[Distractor]*
*Orders results by total_spent ascending (ORDER BY total_spent ASC) instead of descending.*

**Columns:** `user_id`, `order_count`, `total_spent` | **Row Count:** `4`

| user_id | order_count | total_spent |
| --- | --- | --- |
| 9 | 1 | 19.35 |
| 14 | 1 | 54.03 |
| 10 | 1 | 78.59 |
| 20 | 1 | 93.11 |

#### Option C *[Distractor]*
*Groups results by order status (GROUP BY status) instead of user_id.*

**Columns:** `status`, `order_count`, `total_spent` | **Row Count:** `4`

| status | order_count | total_spent |
| --- | --- | --- |
| REFUNDED | 11 | 1542.12 |
| CANCELLED | 6 | 536.55 |
| COMPLETED | 5 | 526.26 |
| PENDING | 5 | 525.63 |

#### Option D *[Distractor]*
*Calculates total spent across all orders without applying the threshold filter (WHERE amount >= 180), and omits the order_count column.*

**Columns:** `user_id`, `total_spent` | **Row Count:** `4`

| user_id | total_spent |
| --- | --- |
| 16 | 406.9 |
| 12 | 295.45 |
| 18 | 273.99 |
| 28 | 273.09 |

---
