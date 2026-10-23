# Study Questions Reference (Q1–Q25)

## 1. Host-Language Code Structures Overview

Each of the 25 study questions is embedded inside Python or JavaScript using one of **5 code structures**:

| Structure | Block Sequence | Description |
| :--- | :--- | :--- |
| **Structure 1** | `[HostLang] → [Query] → [Execute]` | Host-language code executes before the query is defined and executed. |
| **Structure 2** | `[Query 1] → [HostLang] → [Query 2] → [Execute]` | An initial query is defined, followed by host-language code, a second query definition, and execution. |
| **Structure 3** | `[HostLang] → [Query] → [HostLang] → [Execute]` | Host-language code surrounds the query definition before execution. |
| **Structure 4** | `[Query] → [HostLang] → [Execute]` | A query is defined, followed by host-language code (which may or may not mutate `query`), then executed. |
| **Structure 5** | `[Query 1] → ([Execute 1]) → [HostLang] → [Query 2] → ([Execute 2])` | Two queries with intervening host-language code and selective execution/clearing of the first or second query. |

---

## 2. Quick Summary Table (Q1–Q25)

| Question | Structure | Operators Used | Executed SQL Query |
| :--- | :--- | :--- | :--- |
| **Q1** | Structure 2 | `SELECT`, `WHERE`, `ORDER BY` | `SELECT id, name FROM users WHERE id > 2 ORDER BY id ASC;` |
| **Q2** | Structure 3 | `SELECT`, `AVG` | `SELECT AVG(amount) AS avg_amount FROM orders;` |
| **Q3** | Structure 4 | `SELECT`, `WHERE`, `LIKE` | `SELECT id, name FROM users WHERE name LIKE 'A%';` |
| **Q4** | Structure 5 | `SELECT`, `AVG` *(Query 1)*, `MIN` *(Query 2)* | `SELECT MIN(score) AS min_score FROM reviews;` |
| **Q5** | Structure 1 | `SELECT`, `JOIN`, `WHERE`, `ORDER BY` | `SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6 ORDER BY orders.id ASC;` |
| **Q6** | Structure 2 | `SELECT`, `WHERE`, `ORDER BY` | `SELECT id, title FROM products WHERE id > 3 ORDER BY id ASC;` |
| **Q7** | Structure 4 | `SELECT`, `WHERE`, `LIKE` | `SELECT id, status FROM orders WHERE status LIKE 'P%';` |
| **Q8** | Structure 5 | `SELECT`, `AVG` *(Query 1)*, `MAX` *(Query 2)* | `SELECT MAX(score) AS max_score FROM reviews;` |
| **Q9** | Structure 1 | `SELECT`, `JOIN`, `WHERE`, `ORDER BY` | `SELECT products.id, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 6 ORDER BY products.id ASC;` |
| **Q10** | Structure 3 | `SELECT`, `AVG` | `SELECT AVG(price) AS avg_price FROM products;` |
| **Q11** | Structure 5 | `SELECT`, `WHERE`, `GROUP BY`, `MIN`, `MAX`, `ORDER BY` | `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;` |
| **Q12** | Structure 2 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY` *(Query 1)*; `SELECT`, `WHERE`, `GROUP BY`, `ROUND`, `SUM`, `ORDER BY` *(Query 2)* | `SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;` |
| **Q13** | Structure 3 | `SELECT`, `WHERE`, `ORDER BY` | `SELECT id, name FROM users WHERE id <= 5 ORDER BY name ASC;` |
| **Q14** | Structure 4 | `SELECT`, `GROUP BY`, `SUM`, `ROUND`, `AVG`, `ORDER BY` | `SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM reviews GROUP BY order_id ORDER BY order_id DESC;` |
| **Q15** | Structure 1 | `SELECT`, `ORDER BY` | `SELECT orders.id AS order_id FROM orders ORDER BY orders.id ASC;` |
| **Q16** | Structure 4 | `SELECT`, `JOIN`, `WHERE`, `ORDER BY` | `SELECT products.id, products.title, categories.name AS category_name, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 5 ORDER BY products.id ASC;` |
| **Q17** | Structure 1 | `SELECT`, `JOIN`, `WHERE`, `UNION` | `SELECT orders.id, users.name, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.amount > 100 UNION SELECT orders.id, users.name, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.status = 'COMPLETED';` |
| **Q18** | Structure 2 | `SELECT`, `WHERE`, `SUM`, `AVG` *(Query 1)*; `SELECT`, `WHERE`, `ORDER BY` *(Query 2)* | `SELECT products.id, products.title, products.price FROM products WHERE products.id <= 3 ORDER BY products.id ASC;` |
| **Q19** | Structure 3 | `SELECT`, `WHERE`, `LIKE`, `ROUND`, `SUM`, `GROUP BY` | `SELECT orders.status, ROUND(SUM(orders.amount), 2) AS rounded_total FROM orders WHERE orders.status LIKE 'COMP%' GROUP BY orders.status;` |
| **Q20** | Structure 5 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY` | `SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status ORDER BY order_count DESC, status DESC;` |
| **Q21** | Structure 3 | `SELECT`, `JOIN`, `GROUP BY`, `SUM`, `COUNT`, `ORDER BY`, `LIMIT` | `SELECT users.name, users.age, users.is_active, SUM(orders.amount) AS total_spent, COUNT(reviews.id) AS review_count FROM users JOIN orders ON orders.user_id = users.id JOIN reviews ON reviews.order_id = orders.id GROUP BY users.name, users.age, users.is_active ORDER BY users.name ASC LIMIT 3;` |
| **Q22** | Structure 2 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY` | `SELECT user_id, COUNT(*) AS order_count FROM orders WHERE user_id <= 10 GROUP BY user_id ORDER BY order_count ASC;` |
| **Q23** | Structure 5 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ROUND`, `SUM`, `AVG`, `MAX`, `ORDER BY`, `LIMIT` | `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM orders WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent DESC LIMIT 3;` |
| **Q24** | Structure 4 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `AVG`, `ROUND`, `ORDER BY` | `SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM products WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY avg_price DESC;` |
| **Q25** | Structure 1 | `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `SUM`, `ROUND`, `ORDER BY`, `LIMIT` | `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM orders WHERE amount >= 180 GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;` |

---

## 3. Detailed Question Breakdown (Q1–Q25)

### Question 1
- **Structure**: Structure 2 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Defines an initial query, clears it (`del query` in Python / `query = null;` in JavaScript), assigns the second query, and executes the second query.
- **Initial Query (Cleared)**:
  ```sql
  SELECT id, name FROM users WHERE id <= 5;
  ```
- **Executed Query**:
  ```sql
  SELECT id, name FROM users WHERE id > 2 ORDER BY id ASC;
  ```

### Question 2
- **Structure**: Structure 3 (`[HostLang / Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `AVG`
- **Host-Language Pattern**: Assigns a formatted string to an unused variable (`formatted_sql`) and computes an unrelated math expression (`total_score = (100 * 2) + 50`) before executing `query`.
- **Executed Query**:
  ```sql
  SELECT AVG(amount) AS avg_amount FROM orders;
  ```

### Question 3
- **Structure**: Structure 4 (`[Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `LIKE`
- **Host-Language Pattern**: Calls `query.replace("A%", "B%")` without reassigning the result back to `query` (strings are immutable in Python and JavaScript), then executes `query`.
- **Executed Query**:
  ```sql
  SELECT id, name FROM users WHERE name LIKE 'A%';
  ```

### Question 4
- **Structure**: Structure 5 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `AVG` *(Query 1)*, `MIN` *(Query 2)*
- **Host-Language Pattern**: Defines Query 1 without executing it, performs string concatenation (`"Review" + "Score"`), overwrites `query` with Query 2, and executes Query 2.
- **Initial Query (Not Executed)**:
  ```sql
  SELECT AVG(amount) AS avg_amount FROM orders;
  ```
- **Executed Query**:
  ```sql
  SELECT MIN(score) AS min_score FROM reviews;
  ```

### Question 5
- **Structure**: Structure 1 (`[HostLang] → [Query] → [Execute]`)
- **Operators Used**: `SELECT`, `JOIN`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Runs a 6-iteration loop incrementing `counter` before defining and executing the `JOIN` query.
- **Executed Query**:
  ```sql
  SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6 ORDER BY orders.id ASC;
  ```

### Question 6
- **Structure**: Structure 2 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Defines an initial query, clears it (`del query` in Python / `query = null;` in JavaScript), assigns the second query, and executes the second query.
- **Initial Query (Cleared)**:
  ```sql
  SELECT id, title FROM products WHERE id <= 4;
  ```
- **Executed Query**:
  ```sql
  SELECT id, title FROM products WHERE id > 3 ORDER BY id ASC;
  ```

### Question 7
- **Structure**: Structure 4 (`[Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `LIKE`
- **Host-Language Pattern**: Calls `query.replace("P%", "S%")` without reassigning the return value to `query`, leaving `query` unchanged when executed.
- **Executed Query**:
  ```sql
  SELECT id, status FROM orders WHERE status LIKE 'P%';
  ```

### Question 8
- **Structure**: Structure 5 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `AVG` *(Query 1)*, `MAX` *(Query 2)*
- **Host-Language Pattern**: Defines Query 1 without executing it, concatenates `"Max" + "Rating"`, overwrites `query` with Query 2, and executes Query 2.
- **Initial Query (Not Executed)**:
  ```sql
  SELECT AVG(price) AS avg_price FROM products;
  ```
- **Executed Query**:
  ```sql
  SELECT MAX(score) AS max_score FROM reviews;
  ```

### Question 9
- **Structure**: Structure 1 (`[HostLang] → [Query] → [Execute]`)
- **Operators Used**: `SELECT`, `JOIN`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Runs a 4-iteration loop incrementing `step_count` / `stepCount` before defining and executing the `JOIN` query.
- **Executed Query**:
  ```sql
  SELECT products.id, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 6 ORDER BY products.id ASC;
  ```

### Question 10
- **Structure**: Structure 3 (`[HostLang] → [Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `AVG`
- **Host-Language Pattern**: Performs string replacement on a separate `template_sql` variable and computes an unused arithmetic value (`computed_limit = (40 * 3) + 15`) before executing `query`.
- **Executed Query**:
  ```sql
  SELECT AVG(price) AS avg_price FROM products;
  ```

### Question 11
- **Structure**: Structure 5 (`[Query 1] → [Execute 1] → [HostLang] → [Query 2] → [Clear Query 2]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `MIN`, `MAX`, `ORDER BY`
- **Host-Language Pattern**: Executes Query 1 and stores the result in `result_table` / `resultTable`, runs a checkpoint loop, defines Query 2, and deletes/clears `query` without executing Query 2.
- **Executed Query (Query 1)**:
  ```sql
  SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;
  ```
- **Second Query (Cleared, Not Executed)**:
  ```sql
  SELECT category_id, MAX(price) AS max_price, MIN(price) AS min_price FROM products WHERE price > 35 GROUP BY category_id ORDER BY category_id DESC;
  ```

### Question 12
- **Structure**: Structure 2 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY` *(Query 1)*; `SELECT`, `WHERE`, `GROUP BY`, `ROUND`, `SUM`, `ORDER BY` *(Query 2)*
- **Host-Language Pattern**: Defines Query 1 (`COUNT(*) AS item_count`), inspects query clauses in host-language code (`query_clauses`), overwrites `query` with Query 2 (`ROUND(SUM(price), 2) AS sum_price`), and executes Query 2.
- **Initial Query (Overwritten)**:
  ```sql
  SELECT category_id, COUNT(*) AS item_count FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;
  ```
- **Executed Query (Query 2)**:
  ```sql
  SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;
  ```

### Question 13
- **Structure**: Structure 3 (`[HostLang] → [Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Defines a helper function `append_to_query("ORDER BY id DESC")` that only appends to a local list (`log_buffer`) without modifying `query`, then executes `query`.
- **Executed Query**:
  ```sql
  SELECT id, name FROM users WHERE id <= 5 ORDER BY name ASC;
  ```

### Question 14
- **Structure**: Structure 4 (`[Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `GROUP BY`, `SUM`, `ROUND`, `AVG`, `ORDER BY`
- **Host-Language Pattern**: Defines a query sorted `DESC`, calls `query.replace("DESC", "ASC")` without reassigning the result back to `query`, and executes `query`.
- **Executed Query**:
  ```sql
  SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM reviews GROUP BY order_id ORDER BY order_id DESC;
  ```

### Question 15
- **Structure**: Structure 1 (`[HostLang] → [Query] → [Execute]`)
- **Operators Used**: `SELECT`, `ORDER BY`
- **Host-Language Pattern**: Compares the lengths of two arrays (`orders_count = 6` vs. `products_count = 3`) in an `if / else` branch and selects the `if` branch (`orders_count >= products_count`).
- **Executed Query (`if` branch)**:
  ```sql
  SELECT orders.id AS order_id FROM orders ORDER BY orders.id ASC;
  ```
- **Alternate Query (`else` branch, Not Taken)**:
  ```sql
  SELECT products.title AS product_name FROM products ORDER BY products.id ASC;
  ```

### Question 16
- **Structure**: Structure 4 (`[Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `JOIN`, `WHERE`, `ORDER BY`
- **Host-Language Pattern**: Defines the `JOIN` query, declares four unused column-name string variables in the host language, and executes `query`.
- **Executed Query**:
  ```sql
  SELECT products.id, products.title, categories.name AS category_name, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 5 ORDER BY products.id ASC;
  ```

### Question 17
- **Structure**: Structure 1 (`[HostLang] → [Query] → [Execute]`)
- **Operators Used**: `SELECT`, `JOIN`, `WHERE`, `UNION`
- **Host-Language Pattern**: Runs a status-code loop in the host language, then defines and executes a compound `JOIN` + `UNION` query.
- **Executed Query**:
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

### Question 18
- **Structure**: Structure 2 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `SUM`, `AVG` *(Query 1)*; `SELECT`, `WHERE`, `ORDER BY` *(Query 2)*
- **Host-Language Pattern**: Defines an aggregate Query 1 on `orders`, mutates it via `.replace(...)` calls into a `users` query, then completely overwrites `query` with Query 2 on `products` before executing.
- **Initial Query (Overwritten)**:
  ```sql
  SELECT SUM(amount) AS sum_amt, AVG(amount) AS avg_amt FROM orders WHERE amount > 15;
  ```
- **Executed Query (Query 2)**:
  ```sql
  SELECT products.id, products.title, products.price FROM products WHERE products.id <= 3 ORDER BY products.id ASC;
  ```

### Question 19
- **Structure**: Structure 3 (`[HostLang] → [Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `LIKE`, `ROUND`, `SUM`, `GROUP BY`
- **Host-Language Pattern**: Uses SQL-like keywords and variable names (`like_match`, `sum_amount`, `group_status = "PENDING"`, `rounded_total`) in surrounding host-language code without modifying `query`.
- **Executed Query**:
  ```sql
  SELECT orders.status, ROUND(SUM(orders.amount), 2) AS rounded_total FROM orders WHERE orders.status LIKE 'COMP%' GROUP BY orders.status;
  ```

### Question 20
- **Structure**: Structure 5 (`[Query 1] → [Execute 1 (Non-Existent Var)] → [HostLang] → [Query 2] → [Execute 2]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY`
- **Host-Language Pattern**: Attempts to execute a non-existent variable `db.execute(initial_query)` (`db.execute(initialQuery)`), modifies `query` via string operations, then overwrites `query` with Query 2 and assigns `result_table = db.execute(query)`.
- **Initial Query (Overwritten)**:
  ```sql
  SELECT id, amount, status FROM orders WHERE amount > 50;
  ```
- **Executed Query (Query 2)**:
  ```sql
  SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status ORDER BY order_count DESC, status DESC;
  ```

### Question 21
- **Structure**: Structure 3 (`[HostLang] → [Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `JOIN`, `GROUP BY`, `SUM`, `COUNT`, `ORDER BY`, `LIMIT`
- **Host-Language Pattern**: Defines a function `append_order_quantity(q)` that would append `SUM(orders.quantity) AS total_quantity`, but never calls the function before executing `query`.
- **Executed Query**:
  ```sql
  SELECT users.name, users.age, users.is_active, SUM(orders.amount) AS total_spent, COUNT(reviews.id) AS review_count FROM users JOIN orders ON orders.user_id = users.id JOIN reviews ON reviews.order_id = orders.id GROUP BY users.name, users.age, users.is_active ORDER BY users.name ASC LIMIT 3;
  ```

### Question 22
- **Structure**: Structure 2 (`[Query 1] → [HostLang] → [Query 2] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ORDER BY`
- **Host-Language Pattern**: Defines Query 1 grouping `orders` by `status`, inspects query clauses in host-language code, then overwrites `query` with Query 2 grouping `orders` by `user_id` sorted by `order_count ASC` and executes it.
- **Initial Query (Overwritten)**:
  ```sql
  SELECT status, COUNT(*) AS status_count FROM orders GROUP BY status ORDER BY status_count DESC;
  ```
- **Executed Query (Query 2)**:
  ```sql
  SELECT user_id, COUNT(*) AS order_count FROM orders WHERE user_id <= 10 GROUP BY user_id ORDER BY order_count ASC;
  ```

### Question 23
- **Structure**: Structure 5 (`[Query 1] → [Execute 1 (Undefined Var)] → [HostLang] → [Query 2] → [Execute 2]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `ROUND`, `SUM`, `AVG`, `MAX`, `ORDER BY`, `LIMIT`
- **Host-Language Pattern**: Defines `query` (Query 1 on `products`), attempts to execute `db.execute(queryy)` before `queryy` is defined, performs an unassigned `.replace(...)` inside an `if` block, defines `queryy` (Query 2 on `orders`), and executes `result_table = db.execute(queryy)`.
- **Initial Query (`query`, Not Executed)**:
  ```sql
  SELECT title, MAX(price) AS price, SUM(stock) AS stock FROM products GROUP BY title ORDER BY title ASC LIMIT 3;
  ```
- **Executed Query (`queryy`)**:
  ```sql
  SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM orders WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent DESC LIMIT 3;
  ```

### Question 24
- **Structure**: Structure 4 (`[Query] → [HostLang] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `AVG`, `ROUND`, `ORDER BY`
- **Host-Language Pattern**: Defines an initial query with `WHERE price > 15`, then dynamically injects `AND stock > 20` into `query` via an `if / else` string replacement before executing `query`.
- **Initial Query (Before Host-Language Filter Injection)**:
  ```sql
  SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM products WHERE price > 15 GROUP BY category_id, stock ORDER BY avg_price DESC;
  ```
- **Executed Query (After Host-Language Filter Injection)**:
  ```sql
  SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM products WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY avg_price DESC;
  ```

### Question 25
- **Structure**: Structure 1 (`[HostLang] → [Query] → [Execute]`)
- **Operators Used**: `SELECT`, `WHERE`, `GROUP BY`, `COUNT`, `SUM`, `ROUND`, `ORDER BY`, `LIMIT`
- **Host-Language Pattern**: Defines `min_amount = 180` (`minAmount = 180`) in the host language and interpolates it into the query's `WHERE amount >= 180` filter before executing.
- **Executed Query**:
  ```sql
  SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM orders WHERE amount >= 180 GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;
  ```
