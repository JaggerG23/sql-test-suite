-- ============================================================================
-- SQL RANDOMIZED TEST SUITE - QUESTIONS 1 TO 20
-- Includes Executed SQL Queries AND All Potential Answer Options (A, B, C, D)
-- ============================================================================

-- ============================================================================
-- QUESTION 1 (Correct Option: A)
-- ============================================================================
SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6 ORDER BY orders.id ASC;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 6 row(s) | Columns: (id, amount)
--     Note: Matches exact query output.
--       Row 1: [1, 185.51]
--       Row 2: [2, 183.64]
--       Row 3: [3, 148.45]
--       ... (3 more rows)
--   Option B [Distractor]: 30 row(s) | Columns: (id, amount)
--     Note: Unfiltered data (WHERE clause conditions were not applied).
--       Row 1: [1, 185.51]
--       Row 2: [2, 183.64]
--       Row 3: [3, 148.45]
--       ... (27 more rows)
--   Option C [Distractor]: 6 row(s) | Columns: (id, amount)
--     Note: Assumes rows are sorted by orders.amount in descending order.
--       Row 1: [1, 185.51]
--       Row 2: [2, 183.64]
--       Row 3: [6, 176.21]
--       ... (3 more rows)
--   Option D [Distractor]: 6 row(s) | Columns: (id, amount)
--     Note: Assumes rows are sorted by orders.id in descending order.
--       Row 1: [6, 176.21]
--       Row 2: [5, 21.95]
--       Row 3: [4, 29.23]
--       ... (3 more rows)


-- ============================================================================
-- QUESTION 2 (Correct Option: C)
-- ============================================================================
SELECT id, name FROM users WHERE id > 2 ORDER BY id ASC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 5 row(s) | Columns: (id, name)
--     Note: Evaluates the first query which was deleted prior to execution.
--       Row 1: [1, 'George Jones']
--       Row 2: [2, 'Fiona Williams']
--       Row 3: [3, 'Charlie Rodriguez']
--       ... (2 more rows)
--   Option B [Distractor]: 30 row(s) | Columns: (id, name)
--     Note: Unfiltered data (WHERE clause conditions were not applied).
--       Row 1: [1, 'George Jones']
--       Row 2: [2, 'Fiona Williams']
--       Row 3: [3, 'Charlie Rodriguez']
--       ... (27 more rows)
--   Option C [CORRECT ANSWER]: 28 row(s) | Columns: (id, name)
--     Note: Matches exact query output.
--       Row 1: [3, 'Charlie Rodriguez']
--       Row 2: [4, 'Fiona Miller']
--       Row 3: [5, 'Ian Smith']
--       ... (25 more rows)
--   Option D [Distractor]: 28 row(s) | Columns: (id, name)
--     Note: Inverted sort order.
--       Row 1: [30, 'Evan Jones']
--       Row 2: [29, 'Bob Johnson']
--       Row 3: [28, 'Alice Williams']
--       ... (25 more rows)


-- ============================================================================
-- QUESTION 3 (Correct Option: D)
-- ============================================================================
SELECT AVG(amount) AS avg_amount FROM orders;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 1 row(s) | Columns: (query)
--     Note: Assumes the unexecuted SQL query string is returned as text output.
--       Row 1: ['SELECT AVG(amount) AS avg_amount FROM orders;']
--   Option B [Distractor]: 1 row(s) | Columns: (avg_amount)
--     Note: Assumes the second host-language arithmetic calculation ((100 * 2) + 50 = 250) is returned.
--       Row 1: [250]
--   Option C [Distractor]: 1 row(s) | Columns: (avg_amount)
--     Note: Assumes the aggregate expression string "AVG(amount)" is returned instead of being calculated.
--       Row 1: ['AVG(amount)']
--   Option D [CORRECT ANSWER]: 1 row(s) | Columns: (avg_amount)
--     Note: Matches exact query output.
--       Row 1: [98.70833333333331]


-- ============================================================================
-- QUESTION 4 (Correct Option: C)
-- ============================================================================
SELECT id, name FROM users WHERE name LIKE 'A%';

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 3 row(s) | Columns: (id, name)
--     Note: Evaluates an alternative LIKE pattern (names starting with C).
--       Row 1: [3, 'Charlie Rodriguez']
--       Row 2: [9, 'Charlie Miller']
--       Row 3: [26, 'Charlie Miller']
--   Option B [Distractor]: 4 row(s) | Columns: (id, name)
--     Note: Unfiltered table rows without applying the LIKE filter.
--       Row 1: [1, 'George Jones']
--       Row 2: [2, 'Fiona Williams']
--       Row 3: [3, 'Charlie Rodriguez']
--       ... (1 more rows)
--   Option C [CORRECT ANSWER]: 5 row(s) | Columns: (id, name)
--     Note: Matches exact query output.
--       Row 1: [6, 'Alice Johnson']
--       Row 2: [11, 'Alice Miller']
--       Row 3: [12, 'Alice Martinez']
--       ... (2 more rows)
--   Option D [Distractor]: 3 row(s) | Columns: (id, name)
--     Note: Assumes query.replace("A%", "B%") mutated the query in-place.
--       Row 1: [7, 'Bob Rodriguez']
--       Row 2: [13, 'Bob Smith']
--       Row 3: [29, 'Bob Johnson']


-- ============================================================================
-- QUESTION 5 (Correct Option: A)
-- ============================================================================
SELECT MIN(score) AS min_score FROM reviews;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 1 row(s) | Columns: (min_score)
--     Note: Matches exact query output.
--       Row 1: [1]
--   Option B [Distractor]: 1 row(s) | Columns: (min_score)
--     Note: Assumes the aggregate expression string "MIN(score)" is returned instead of the evaluated minimum numeric score.
--       Row 1: ['MIN(score)']
--   Option C [Distractor]: 1 row(s) | Columns: (combined_text)
--     Note: Assumes the host-language string concatenation ("ReviewScore") is returned as the table output.
--       Row 1: ['ReviewScore']
--   Option D [Distractor]: 1 row(s) | Columns: (query)
--     Note: Assumes the first unexecuted SQL query string is returned as text output.
--       Row 1: ['SELECT AVG(amount) AS avg_amount FROM orders;']


-- ============================================================================
-- QUESTION 6 (Correct Option: B)
-- ============================================================================
SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 16 row(s) | Columns: (category_id, max_price, min_price, item_count, avg_price)
--     Note: Evaluates query 2 with extra aggregate summary columns (item_count, avg_price) sorted by category_id DESC.
--       Row 1: [30, 176.9, 176.9, 1, 176.9]
--       Row 2: [29, 137.24, 108.67, 2, 122.96]
--       Row 3: [25, 172.4, 172.4, 1, 172.4]
--       ... (13 more rows)
--   Option B [CORRECT ANSWER]: 16 row(s) | Columns: (category_id, min_price, max_price)
--     Note: Matches exact query output.
--       Row 1: [2, 50.94, 50.94]
--       Row 2: [3, 91.08, 106.31]
--       Row 3: [5, 32.83, 166.52]
--       ... (13 more rows)
--   Option C [Distractor]: 16 row(s) | Columns: (category_id, min_price, max_price, product_count)
--     Note: Evaluates unfiltered MIN/MAX with an extra product_count column sorted by min_price DESC.
--       Row 1: [30, 176.9, 176.9, 1]
--       Row 2: [25, 172.4, 172.4, 1]
--       Row 3: [11, 171.62, 171.62, 1]
--       ... (13 more rows)
--   Option D [Distractor]: 16 row(s) | Columns: (category_id, min_price, max_price, total_stock, avg_rating)
--     Note: Evaluates query 1 with extra inventory and rating columns (total_stock, avg_rating) sorted by total_stock DESC.
--       Row 1: [15, 114.27, 147.41, 229, 3.4]
--       Row 2: [21, 114.2, 117.2, 195, 3]
--       Row 3: [10, 35.32, 138.58, 190, 2.6]
--       ... (13 more rows)


-- ============================================================================
-- QUESTION 7 (Correct Option: D)
-- ============================================================================
SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM products WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 15 row(s) | Columns: (category_id, sum_price, item_count, avg_price)
--     Note: Evaluates unnecessary additional columns (item_count, avg_price).
--       Row 1: [1, 66.52, 1, 66.52]
--       Row 2: [7, 323.1, 3, 107.7]
--       Row 3: [12, 136.91, 1, 136.91]
--       ... (12 more rows)
--   Option B [Distractor]: 15 row(s) | Columns: (category_id, sum_price)
--     Note: Inverted sort order for query 1 (DESC instead of ASC).
--       Row 1: [29, 267.49]
--       Row 2: [27, 200.78]
--       Row 3: [26, 244.08]
--       ... (12 more rows)
--   Option C [Distractor]: 15 row(s) | Columns: (category_id, item_count)
--     Note: Evaluates the item count (COUNT) instead of the total price (SUM).
--       Row 1: [1, 1]
--       Row 2: [7, 3]
--       Row 3: [12, 1]
--       ... (12 more rows)
--   Option D [CORRECT ANSWER]: 15 row(s) | Columns: (category_id, sum_price)
--     Note: Matches exact query output.
--       Row 1: [1, 66.52]
--       Row 2: [7, 323.1]
--       Row 3: [12, 136.91]
--       ... (12 more rows)


-- ============================================================================
-- QUESTION 8 (Correct Option: A)
-- ============================================================================
SELECT id, name FROM users WHERE id <= 5 ORDER BY name ASC;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 5 row(s) | Columns: (id, name)
--     Note: Matches exact query output.
--       Row 1: [4, 'Bob Garcia']
--       Row 2: [2, 'Charlie Davis']
--       Row 3: [3, 'Fiona Jones']
--       ... (2 more rows)
--   Option B [Distractor]: 5 row(s) | Columns: (id, name)
--     Note: Evaluates an alternative filter range (ids 6 to 10).
--       Row 1: [6, 'Alice Rodriguez']
--       Row 2: [8, 'Bob Miller']
--       Row 3: [7, 'Fiona Garcia']
--       ... (2 more rows)
--   Option C [Distractor]: 5 row(s) | Columns: (id, name)
--     Note: Assumes rows are sorted by id ASC instead of name ASC.
--       Row 1: [1, 'George Martinez']
--       Row 2: [2, 'Charlie Davis']
--       Row 3: [3, 'Fiona Jones']
--       ... (2 more rows)
--   Option D [Distractor]: 5 row(s) | Columns: (id, name)
--     Note: Assumes the append function call modified the query to sort by id DESC.
--       Row 1: [5, 'Hannah Smith']
--       Row 2: [4, 'Bob Garcia']
--       Row 3: [3, 'Fiona Jones']
--       ... (2 more rows)


-- ============================================================================
-- QUESTION 9 (Correct Option: D)
-- ============================================================================
SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM reviews GROUP BY order_id ORDER BY order_id DESC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 7 row(s) | Columns: (order_id, total_score, avg_score, min_score)
--     Note: Assumes the query was sorted by total_score DESC with an extra min_score column.
--       Row 1: [1, 21, 2.63, 1]
--       Row 2: [2, 17, 4.25, 4]
--       Row 3: [4, 15, 3, 1]
--       ... (4 more rows)
--   Option B [Distractor]: 7 row(s) | Columns: (order_id, item_count, avg_score, max_score)
--     Note: Evaluates item_count and max_score sorted by item_count DESC.
--       Row 1: [1, 8, 2.63, 5]
--       Row 2: [8, 5, 1.8, 3]
--       Row 3: [4, 5, 3, 5]
--       ... (4 more rows)
--   Option C [Distractor]: 7 row(s) | Columns: (order_id, total_score, avg_score)
--     Note: Evaluates the initial query (ordered by order_id ASC), assuming the HLL string rewrite to DESC was not applied.
--       Row 1: [1, 21, 2.63]
--       Row 2: [2, 17, 4.25]
--       Row 3: [3, 2, 2]
--       ... (4 more rows)
--   Option D [CORRECT ANSWER]: 7 row(s) | Columns: (order_id, total_score, avg_score)
--     Note: Matches exact query output.
--       Row 1: [8, 9, 1.8]
--       Row 2: [7, 9, 3]
--       Row 3: [6, 11, 2.75]
--       ... (4 more rows)


-- ============================================================================
-- QUESTION 10 (Correct Option: A)
-- ============================================================================
SELECT orders.id AS order_id FROM orders ORDER BY orders.id ASC;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 30 row(s) | Columns: (order_id)
--     Note: Matches exact query output.
--       Row 1: [1]
--       Row 2: [2]
--       Row 3: [3]
--       ... (27 more rows)
--   Option B [Distractor]: 30 row(s) | Columns: (quantity)
--     Note: Outputs the order quantities instead of the order IDs.
--       Row 1: [68]
--       Row 2: [81]
--       Row 3: [8]
--       ... (27 more rows)
--   Option C [Distractor]: 30 row(s) | Columns: (product_name)
--     Note: Assumes the count of products ID was strictly greater than orders quantity, which would output all product names.
--       Row 1: ['Smartwatch']
--       Row 2: ['Keyboard']
--       Row 3: ['Camera']
--       ... (27 more rows)
--   Option D [Distractor]: 1 row(s) | Columns: (total_count)
--     Note: Outputs the numeric count value instead of selecting the table rows.
--       Row 1: [30]


-- ============================================================================
-- QUESTION 11 (Correct Option: D)
-- ============================================================================
SELECT products.id, products.title, categories.name AS category_name, products.price FROM products JOIN categories ON products.category_id = categories.id WHERE products.id <= 5 ORDER BY products.id ASC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 5 row(s) | Columns: (id, title, price)
--     Note: Evaluates the JOIN result but omits the joined category_name column.
--       Row 1: [1, 'Smartwatch', 77.28]
--       Row 2: [2, 'Keyboard', 87.28]
--       Row 3: [3, 'Camera', 77.59]
--       ... (2 more rows)
--   Option B [Distractor]: 5 row(s) | Columns: (id, title, category_id, category_name, price)
--     Note: Evaluates the JOIN result with an extra category_id foreign key column.
--       Row 1: [1, 'Smartwatch', 26, 'Charlie Brown', 77.28]
--       Row 2: [2, 'Keyboard', 21, 'Bob Garcia', 87.28]
--       Row 3: [3, 'Camera', 29, 'Fiona Brown', 77.59]
--       ... (2 more rows)
--   Option C [Distractor]: 5 row(s) | Columns: (id, title, category_name, stock, price)
--     Note: Evaluates the JOIN result with an extra stock inventory column.
--       Row 1: [1, 'Smartwatch', 'Charlie Brown', 73, 77.28]
--       Row 2: [2, 'Keyboard', 'Bob Garcia', 70, 87.28]
--       Row 3: [3, 'Camera', 'Fiona Brown', 69, 77.59]
--       ... (2 more rows)
--   Option D [CORRECT ANSWER]: 5 row(s) | Columns: (id, title, category_name, price)
--     Note: Matches exact query output.
--       Row 1: [1, 'Smartwatch', 'Charlie Brown', 77.28]
--       Row 2: [2, 'Keyboard', 'Bob Garcia', 87.28]
--       Row 3: [3, 'Camera', 'Fiona Brown', 77.59]
--       ... (2 more rows)


-- ============================================================================
-- QUESTION 12 (Correct Option: C)
-- ============================================================================
SELECT orders.id, users.name, orders.amount
FROM orders
JOIN users ON orders.user_id = users.id
WHERE orders.amount > 100
UNION
SELECT orders.id, users.name, orders.amount
FROM orders
JOIN users ON orders.user_id = users.id
WHERE orders.status = 'COMPLETED';

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 16 row(s) | Columns: (id, name, amount, status)
--     Note: Evaluates the joined UNION statement with an additional status column included in the projection.
--       Row 1: [1, 'Fiona Garcia', 184.21, 'PENDING']
--       Row 2: [2, 'Alice Rodriguez', 176.79, 'PENDING']
--       Row 3: [3, 'Charlie Martinez', 140.06, 'SHIPPED']
--       ... (13 more rows)
--   Option B [Distractor]: 3 row(s) | Columns: (id, name, amount)
--     Note: Evaluates only the second query in the compound UNION statement (orders with status = 'COMPLETED').
--       Row 1: [4, 'Charlie Brown', 192.2]
--       Row 2: [16, 'Fiona Jones', 85.33]
--       Row 3: [30, 'Fiona Jones', 186.83]
--   Option C [CORRECT ANSWER]: 16 row(s) | Columns: (id, name, amount)
--     Note: Matches exact query output.
--       Row 1: [1, 'Fiona Garcia', 184.21]
--       Row 2: [2, 'Alice Rodriguez', 176.79]
--       Row 3: [3, 'Charlie Martinez', 140.06]
--       ... (13 more rows)
--   Option D [Distractor]: 15 row(s) | Columns: (id, name, amount)
--     Note: Evaluates only the first query in the compound UNION statement (orders with amount > 100).
--       Row 1: [1, 'Fiona Garcia', 184.21]
--       Row 2: [2, 'Alice Rodriguez', 176.79]
--       Row 3: [3, 'Charlie Martinez', 140.06]
--       ... (12 more rows)


-- ============================================================================
-- QUESTION 13 (Correct Option: A)
-- ============================================================================
SELECT products.id, products.title, products.price FROM products WHERE products.id <= 3 ORDER BY products.id ASC;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 3 row(s) | Columns: (id, title, price)
--     Note: Matches exact query output.
--       Row 1: [1, 'Tablet', 47.84]
--       Row 2: [2, 'Tablet', 39.93]
--       Row 3: [3, 'Camera', 55.64]
--   Option B [Distractor]: 1 row(s) | Columns: (sum_amt, avg_amt)
--     Note: Assumes the initial aggregation query on orders was executed before it was modified and overridden.
--       Row 1: [3148.149999999999, 116.59814814814811]
--   Option C [Distractor]: 3 row(s) | Columns: (id, title, price)
--     Note: Evaluates an alternative product ID range (IDs 4 to 6 instead of 1 to 3).
--       Row 1: [4, 'Tablet', 157.64]
--       Row 2: [5, 'Camera', 133.63]
--       Row 3: [6, 'Smartwatch', 61]
--   Option D [Distractor]: 3 row(s) | Columns: (id, name, rating)
--     Note: Assumes the host language string manipulation on query was executed instead of the second query.
--       Row 1: [1, 'Diana Smith', 3.52]
--       Row 2: [2, 'Fiona Williams', 4.76]
--       Row 3: [3, 'Diana Miller', 4.11]


-- ============================================================================
-- QUESTION 14 (Correct Option: B)
-- ============================================================================
SELECT orders.status, ROUND(SUM(orders.amount), 2) AS rounded_total FROM orders WHERE orders.status LIKE 'COMP%' GROUP BY orders.status;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 1 row(s) | Columns: (status, rounded_total)
--     Note: Assumes the host language variable group_status = 'PENDING' or status LIKE 'COMP%' matched 'PENDING'.
--       Row 1: ['PENDING', 533.62]
--   Option B [CORRECT ANSWER]: 1 row(s) | Columns: (status, rounded_total)
--     Note: Matches exact query output.
--       Row 1: ['COMPLETED', 440.09]
--   Option C [Distractor]: 1 row(s) | Columns: (user_id, rounded_total)
--     Note: Projects user_id instead of the grouped status column.
--       Row 1: [7, 200.14]
--   Option D [Distractor]: 1 row(s) | Columns: (status, avg_amount)
--     Note: Computes the average (AVG) per order instead of the total rounded sum (SUM).
--       Row 1: ['COMPLETED', 88.02]


-- ============================================================================
-- QUESTION 15 (Correct Option: A)
-- ============================================================================
SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status ORDER BY order_count DESC, status DESC;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 5 row(s) | Columns: (status, order_count)
--     Note: Matches exact query output.
--       Row 1: ['REFUNDED', 9]
--       Row 2: ['CANCELLED', 8]
--       Row 3: ['COMPLETED', 5]
--       ... (2 more rows)
--   Option B [Distractor]: 5 row(s) | Columns: (status, order_count)
--     Note: Evaluates SUM(amount) instead of COUNT(*).
--       Row 1: ['REFUNDED', 979.2]
--       Row 2: ['CANCELLED', 792.5]
--       Row 3: ['PENDING', 533.6]
--       ... (2 more rows)
--   Option C [Distractor]: 23 row(s) | Columns: (status, order_count)
--     Note: Evaluates the first query before modification.
--       Row 1: [1, 114.38, 'CANCELLED']
--       Row 2: [2, 99.02, 'CANCELLED']
--       Row 3: [4, 144.42, 'REFUNDED']
--       ... (20 more rows)
--   Option D [Distractor]: 5 row(s) | Columns: (status, order_count)
--     Note: Inverted sort order for the executed query (ASC instead of DESC).
--       Row 1: ['PENDING', 4]
--       Row 2: ['SHIPPED', 4]
--       Row 3: ['COMPLETED', 5]
--       ... (2 more rows)


-- ============================================================================
-- QUESTION 16 (Correct Option: B)
-- ============================================================================
SELECT users.name, users.age, users.is_active, SUM(orders.amount) AS total_spent, COUNT(reviews.id) AS review_count FROM users JOIN orders ON orders.user_id = users.id JOIN reviews ON reviews.order_id = orders.id GROUP BY users.name, users.age, users.is_active ORDER BY users.name ASC LIMIT 3;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 3 row(s) | Columns: (name, age, is_active, total_spent, review_count, total_quantity)
--     Note: Assumes append_order_quantity(q) was executed, adding total_quantity to the output.
--       Row 1: ['Charlie Davis', 62, 0, 457.52, 4, 180]
--       Row 2: ['Diana Johnson', 19, 1, 1030.26, 6, 564]
--       Row 3: ['Diana Martinez', 19, 0, 594.12, 6, 516]
--   Option B [CORRECT ANSWER]: 3 row(s) | Columns: (name, age, is_active, total_spent, review_count)
--     Note: Matches exact query output.
--       Row 1: ['Charlie Davis', 62, 0, 457.52, 4]
--       Row 2: ['Diana Johnson', 19, 1, 1030.26, 6]
--       Row 3: ['Diana Martinez', 19, 0, 594.12, 6]
--   Option C [Distractor]: 3 row(s) | Columns: (name, age, is_active, avg_spent, review_count)
--     Note: Computes the average order amount (avg_spent) instead of the total spent (total_spent).
--       Row 1: ['Charlie Davis', 62, 0, 114.38, 4]
--       Row 2: ['Diana Johnson', 19, 1, 171.71, 6]
--       Row 3: ['Diana Martinez', 19, 0, 99.02, 6]
--   Option D [Distractor]: 3 row(s) | Columns: (name, age, is_active, total_spent)
--     Note: Omits the reviews table join and review_count aggregate column.
--       Row 1: ['Alice Garcia', 34, 1, 82.45]
--       Row 2: ['Charlie Davis', 62, 0, 114.38]
--       Row 3: ['Charlie Smith', 52, 1, 202.98]


-- ============================================================================
-- QUESTION 17 (Correct Option: C)
-- ============================================================================
SELECT order_count, COUNT(*) AS user_count FROM (SELECT orders.user_id, COUNT(*) AS order_count FROM orders GROUP BY orders.user_id) sub GROUP BY order_count ORDER BY order_count ASC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 4 row(s) | Columns: (user_id, user_count)
--     Note: Projects user_id instead of the outer group column order_count with user_count.
--       Row 1: [1, 12]
--       Row 2: [2, 5]
--       Row 3: [3, 1]
--       ... (1 more rows)
--   Option B [Distractor]: 4 row(s) | Columns: (order_count, total_orders)
--     Note: Sums the order counts (SUM(order_count)) rather than counting distinct users having each order count.
--       Row 1: [1, 12]
--       Row 2: [2, 10]
--       Row 3: [3, 3]
--       ... (1 more rows)
--   Option C [CORRECT ANSWER]: 4 row(s) | Columns: (order_count, user_count)
--     Note: Matches exact query output.
--       Row 1: [1, 12]
--       Row 2: [2, 5]
--       Row 3: [3, 1]
--       ... (1 more rows)
--   Option D [Distractor]: 4 row(s) | Columns: (user_id, order_count)
--     Note: Evaluates the first query before it was overwritten, grouping orders by user_id instead of the nested aggregation.
--       Row 1: [7, 5]
--       Row 2: [20, 3]
--       Row 3: [24, 2]
--       ... (1 more rows)


-- ============================================================================
-- QUESTION 18 (Correct Option: D)
-- ============================================================================
SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM orders WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent DESC LIMIT 3;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 3 row(s) | Columns: (user_id, order_count, total_spent, avg_amount, max_order)
--     Note: Assumes ascending sort order (ORDER BY total_spent ASC) instead of descending (DESC), returning the lowest spenders first.
--       Row 1: [12, 1, 28.52, 28.52, 28.52]
--       Row 2: [15, 1, 42.83, 42.83, 42.83]
--       Row 3: [22, 1, 67.05, 67.05, 67.05]
--   Option B [Distractor]: 3 row(s) | Columns: (title, price, stock)
--     Note: Assumes query was executed instead of queryy, producing the aggregated price and stock grouped by title.
--       Row 1: ['Camera', 133.63, 355]
--       Row 2: ['Headphones', 163.12, 99]
--       Row 3: ['Keyboard', 193.9, 6]
--   Option C [Distractor]: 3 row(s) | Columns: (title, category_id, stock)
--     Note: Assumes the string replacement query.replace("price", "category_id") mutated query in-place.
--       Row 1: ['Camera', 18, 355]
--       Row 2: ['Headphones', 5, 99]
--       Row 3: ['Keyboard', 12, 6]
--   Option D [CORRECT ANSWER]: 3 row(s) | Columns: (user_id, order_count, total_spent, avg_amount, max_order)
--     Note: Matches exact query output.
--       Row 1: [7, 5, 499.82, 99.96, 185.55]
--       Row 2: [20, 3, 488.43, 162.81, 185.28]
--       Row 3: [10, 1, 202.98, 202.98, 202.98]


-- ============================================================================
-- QUESTION 19 (Correct Option: D)
-- ============================================================================
SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM products WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY avg_price DESC;

-- POTENTIAL ANSWERS:
--   Option A [Distractor]: 25 row(s) | Columns: (category_id, stock, count_items, avg_price)
--     Note: Orders rows by stock descending (ORDER BY stock DESC) instead of average price descending.
--       Row 1: [10, 97, 1, 92.19]
--       Row 2: [15, 97, 1, 80.76]
--       Row 3: [17, 88, 1, 141.93]
--       ... (22 more rows)
--   Option B [Distractor]: 15 row(s) | Columns: (category_id, count_items, avg_price)
--     Note: Evaluates the initial query grouped by category_id (ordered by avg_price DESC), omitting the stock column and assuming the host language filter injection was not applied.
--       Row 1: [16, 2, 185.57]
--       Row 2: [7, 2, 155.93]
--       Row 3: [28, 2, 152.3]
--       ... (12 more rows)
--   Option C [Distractor]: 25 row(s) | Columns: (category_id, stock, count_items, avg_price)
--     Note: Orders category groups in ascending order (ORDER BY avg_price ASC) instead of descending order.
--       Row 1: [26, 56, 1, 24.67]
--       Row 2: [14, 86, 1, 34.24]
--       Row 3: [9, 78, 1, 35.13]
--       ... (22 more rows)
--   Option D [CORRECT ANSWER]: 25 row(s) | Columns: (category_id, stock, count_items, avg_price)
--     Note: Matches exact query output.
--       Row 1: [16, 27, 1, 201.69]
--       Row 2: [7, 47, 1, 199.45]
--       Row 3: [15, 59, 1, 195.18]
--       ... (22 more rows)


-- ============================================================================
-- QUESTION 20 (Correct Option: A)
-- ============================================================================
SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM orders WHERE amount >= 180 GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;

-- POTENTIAL ANSWERS:
--   Option A [CORRECT ANSWER]: 2 row(s) | Columns: (user_id, order_count, total_spent)
--     Note: Matches exact query output.
--       Row 1: [29, 1, 193.65]
--       Row 2: [19, 1, 186.25]
--   Option B [Distractor]: 4 row(s) | Columns: (user_id, order_count, total_spent)
--     Note: Orders results by total_spent ascending (ORDER BY total_spent ASC) instead of descending.
--       Row 1: [9, 1, 19.35]
--       Row 2: [14, 1, 54.03]
--       Row 3: [10, 1, 78.59]
--       ... (1 more rows)
--   Option C [Distractor]: 4 row(s) | Columns: (status, order_count, total_spent)
--     Note: Groups results by order status (GROUP BY status) instead of user_id.
--       Row 1: ['REFUNDED', 11, 1542.12]
--       Row 2: ['CANCELLED', 6, 536.55]
--       Row 3: ['COMPLETED', 5, 526.26]
--       ... (1 more rows)
--   Option D [Distractor]: 4 row(s) | Columns: (user_id, total_spent)
--     Note: Calculates total spent across all orders without applying the threshold filter (WHERE amount >= 180), and omits the order_count column.
--       Row 1: [16, 406.9]
--       Row 2: [12, 295.45]
--       Row 3: [18, 273.99]
--       ... (1 more rows)

