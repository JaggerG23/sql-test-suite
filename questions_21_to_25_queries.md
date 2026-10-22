# Study Questions 21 to 25: Queries & Potential Answers

This document contains the **SQL query**, **participant code snippet**, and **all 4 potential answer choices (A, B, C, D)** for **Questions 21 through 25**.

---

## Question 21

### Executed SQL Query:
```sql
SELECT products.id, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 6 ORDER BY products.id ASC;
```

### Code Snippet Presented to Participant:
```
step_count = 0
for i in range(4):
    step_count += 1

query = """
FROM products
|> JOIN categories ON products.category_id = categories.id
|> WHERE products.id <= 6
|> SELECT products.id, products.price
|> ORDER BY id ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option B**

#### Option A *[Distractor]*
*Assumes rows are sorted by products.price in descending order.*

**Columns:** `id`, `price` | **Row Count:** `6`

| id | price |
| --- | --- |
| 5 | 136.1 |
| 2 | 87.28 |
| 4 | 87.27 |
| 3 | 77.59 |
| 1 | 77.28 |
| 6 | 61 |

#### Option B **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `price` | **Row Count:** `6`

| id | price |
| --- | --- |
| 1 | 77.28 |
| 2 | 87.28 |
| 3 | 77.59 |
| 4 | 87.27 |
| 5 | 136.1 |
| 6 | 61 |

#### Option C *[Distractor]*
*Unfiltered data (WHERE clause conditions were not applied).*

**Columns:** `id`, `price` | **Row Count:** `30`

| id | price |
| --- | --- |
| 1 | 77.28 |
| 2 | 87.28 |
| 3 | 77.59 |
| 4 | 87.27 |
| 5 | 136.1 |
| 6 | 61 |
| 7 | 114.2 |
| 8 | 147.41 |
| 9 | 50.94 |
| 10 | 171.62 |
| 11 | 91.08 |
| 12 | 138.58 |
| 13 | 32.83 |
| 14 | 141.2 |
| 15 | 106.31 |
| *... and 15 more rows* | |

#### Option D *[Distractor]*
*Assumes rows are sorted by products.id in descending order.*

**Columns:** `id`, `price` | **Row Count:** `6`

| id | price |
| --- | --- |
| 6 | 61 |
| 5 | 136.1 |
| 4 | 87.27 |
| 3 | 77.59 |
| 2 | 87.28 |
| 1 | 77.28 |

---

## Question 22

### Executed SQL Query:
```sql
SELECT id, title FROM products WHERE id > 3 ORDER BY id ASC;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> WHERE id <= 4
|> SELECT id, title
"""

del query

query = """
FROM products
|> WHERE id > 3
|> SELECT id, title
|> ORDER BY id ASC
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option C**

#### Option A *[Distractor]*
*Unfiltered data (WHERE clause conditions were not applied).*

**Columns:** `id`, `title` | **Row Count:** `30`

| id | title |
| --- | --- |
| 1 | Smartwatch |
| 2 | Keyboard |
| 3 | Camera |
| 4 | Mouse |
| 5 | Monitor |
| 6 | Monitor |
| 7 | Mouse |
| 8 | Laptop |
| 9 | Monitor |
| 10 | Laptop |
| 11 | Camera |
| 12 | Camera |
| 13 | Smartphone |
| 14 | Monitor |
| 15 | Camera |
| *... and 15 more rows* | |

#### Option B *[Distractor]*
*Inverted sort order.*

**Columns:** `id`, `title` | **Row Count:** `27`

| id | title |
| --- | --- |
| 30 | Keyboard |
| 29 | Tablet |
| 28 | Headphones |
| 27 | Smartwatch |
| 26 | Monitor |
| 25 | Laptop |
| 24 | Mouse |
| 23 | Camera |
| 22 | Smartphone |
| 21 | Tablet |
| 20 | Headphones |
| 19 | Keyboard |
| 18 | Monitor |
| 17 | Mouse |
| 16 | Laptop |
| *... and 12 more rows* | |

#### Option C **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `title` | **Row Count:** `27`

| id | title |
| --- | --- |
| 4 | Mouse |
| 5 | Monitor |
| 6 | Monitor |
| 7 | Mouse |
| 8 | Laptop |
| 9 | Monitor |
| 10 | Laptop |
| 11 | Camera |
| 12 | Camera |
| 13 | Smartphone |
| 14 | Monitor |
| 15 | Camera |
| 16 | Laptop |
| 17 | Mouse |
| 18 | Monitor |
| *... and 12 more rows* | |

#### Option D *[Distractor]*
*Evaluates the first query which was deleted prior to execution.*

**Columns:** `id`, `title` | **Row Count:** `4`

| id | title |
| --- | --- |
| 1 | Smartwatch |
| 2 | Keyboard |
| 3 | Camera |
| 4 | Mouse |

---

## Question 23

### Executed SQL Query:
```sql
SELECT AVG(price) AS avg_price FROM products;
```

### Code Snippet Presented to Participant:
```
template_sql = "SELECT * FROM products WHERE price > 0"
formatted_sql = template_sql.replace("WHERE price > 0", "").strip()

query = """
FROM products
|> AGGREGATE AVG(price) AS avg_price
"""

computed_limit = (40 * 3) + 15

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `avg_price` | **Row Count:** `1`

| avg_price |
| --- |
| 112.45 |

#### Option B *[Distractor]*
*Assumes the host-language arithmetic calculation ((40 * 3) + 15 = 135) is returned.*

**Columns:** `avg_price` | **Row Count:** `1`

| avg_price |
| --- |
| 135 |

#### Option C *[Distractor]*
*Assumes the unexecuted SQL query string is returned as text output.*

**Columns:** `query` | **Row Count:** `1`

| query |
| --- |
| SELECT AVG(price) AS avg_price FROM products; |

#### Option D *[Distractor]*
*Assumes the modified string variable `formatted_sql` on line 2 is returned as text output.*

**Columns:** `formatted_sql` | **Row Count:** `1`

| formatted_sql |
| --- |
| SELECT * FROM products |

---

## Question 24

### Executed SQL Query:
```sql
SELECT id, status FROM orders WHERE status LIKE 'P%';
```

### Code Snippet Presented to Participant:
```
query = """
FROM orders
|> WHERE status LIKE 'P%'
|> SELECT id, status
"""

query.replace("P%", "S%")

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option B**

#### Option A *[Distractor]*
*Unfiltered table rows without applying the LIKE filter.*

**Columns:** `id`, `status` | **Row Count:** `4`

| id | status |
| --- | --- |
| 1 | PENDING |
| 2 | PENDING |
| 3 | SHIPPED |
| 4 | COMPLETED |

#### Option B **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `id`, `status` | **Row Count:** `4`

| id | status |
| --- | --- |
| 1 | PENDING |
| 2 | PENDING |
| 9 | PENDING |
| 12 | PENDING |

#### Option C *[Distractor]*
*Assumes query.replace("P%", "S%") mutated the query in-place.*

**Columns:** `id`, `status` | **Row Count:** `4`

| id | status |
| --- | --- |
| 3 | SHIPPED |
| 7 | SHIPPED |
| 15 | SHIPPED |
| 17 | SHIPPED |

#### Option D *[Distractor]*
*Evaluates an alternative LIKE pattern (statuses starting with C).*

**Columns:** `id`, `status` | **Row Count:** `3`

| id | status |
| --- | --- |
| 4 | COMPLETED |
| 16 | COMPLETED |
| 30 | COMPLETED |

---

## Question 25

### Executed SQL Query:
```sql
SELECT MAX(score) AS max_score FROM reviews;
```

### Code Snippet Presented to Participant:
```
query = """
FROM products
|> AGGREGATE AVG(price) AS avg_price
"""

prefix = "Max"
suffix = "Rating"
metric_label = prefix + suffix

query = """
FROM reviews
|> AGGREGATE MAX(score) AS max_score
"""

result_table = db.execute(query)
```

### Potential Answers (Options A – D):
**Correct Answer:** **Option A**

#### Option A **[CORRECT ANSWER]**
*Matches exact query output.*

**Columns:** `max_score` | **Row Count:** `1`

| max_score |
| --- |
| 5 |

#### Option B *[Distractor]*
*Assumes the aggregate expression string "MAX(score)" is returned instead of the evaluated maximum numeric score.*

**Columns:** `max_score` | **Row Count:** `1`

| max_score |
| --- |
| MAX(score) |

#### Option C *[Distractor]*
*Assumes the first unexecuted SQL query string is returned as text output.*

**Columns:** `query` | **Row Count:** `1`

| query |
| --- |
| SELECT AVG(price) AS avg_price FROM products; |

#### Option D *[Distractor]*
*Assumes the host-language string concatenation ("MaxRating") is returned as the table output.*

**Columns:** `metric_label` | **Row Count:** `1`

| metric_label |
| --- |
| MaxRating |