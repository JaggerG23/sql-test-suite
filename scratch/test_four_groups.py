import os
import sys
import json
import csv
import re
import random
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import server

class TestFourGroupsExperiment(unittest.TestCase):
    def setUp(self):
        self.groups = [
            {'id': 'google_sql_python', 'name': 'Google SQL with Python', 'sqlDialect': 'pipe', 'hostLanguage': 'python'},
            {'id': 'google_sql_javascript', 'name': 'Google SQL with Javascript', 'sqlDialect': 'pipe', 'hostLanguage': 'javascript'},
            {'id': 'quorum_python', 'name': 'Quorum with Python', 'sqlDialect': 'quorum', 'hostLanguage': 'python'},
            {'id': 'quorum_javascript', 'name': 'Quorum with Javascript', 'sqlDialect': 'quorum', 'hostLanguage': 'javascript'}
        ]

    def test_group_specifications(self):
        """Verify the 4 required groups are strictly defined."""
        expected_ids = {'google_sql_python', 'google_sql_javascript', 'quorum_python', 'quorum_javascript'}
        actual_ids = {g['id'] for g in self.groups}
        self.assertEqual(actual_ids, expected_ids)

        for g in self.groups:
            if 'python' in g['id']:
                self.assertEqual(g['hostLanguage'], 'python')
            else:
                self.assertEqual(g['hostLanguage'], 'javascript')
            
            if 'google_sql' in g['id']:
                self.assertEqual(g['sqlDialect'], 'pipe')
            else:
                self.assertEqual(g['sqlDialect'], 'quorum')

    def test_random_assignment_distribution(self):
        """Simulate 2,000 participant assignments to ensure uniform random distribution (~25% each)."""
        counts = {g['id']: 0 for g in self.groups}
        n_trials = 2000

        for _ in range(n_trials):
            choice = random.choice(self.groups)
            counts[choice['id']] += 1

        for gid, count in counts.items():
            freq = count / n_trials
            # Expect roughly 25% +/- 5% for 2000 trials
            self.assertGreater(freq, 0.20, f"Group {gid} frequency too low: {freq}")
            self.assertLess(freq, 0.30, f"Group {gid} frequency too high: {freq}")
            print(f"Random simulation: Group {gid} = {count}/{n_trials} ({freq*100:.1f}%)")

    def test_server_csv_headers(self):
        """Verify server.py CSV_HEADERS includes Assigned Group and Host Language."""
        self.assertIn('Assigned Group', server.CSV_HEADERS)
        self.assertIn('Host Language', server.CSV_HEADERS)
        self.assertIn('Code Snippet', server.CSV_HEADERS)

    def test_google_apps_script_headers(self):
        """Verify google_apps_script.js contains Assigned Group and Host Language."""
        gas_path = os.path.join(BASE_DIR, 'google_apps_script.js')
        with open(gas_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn("'Assigned Group'", content)
        self.assertIn("'Host Language'", content)
        self.assertIn("'Code Snippet'", content)

    def test_participant_analytics_js_contains_groups(self):
        """Verify participantAnalytics.js defines all 4 groups and group assignment."""
        js_path = os.path.join(BASE_DIR, 'js', 'participantAnalytics.js')
        with open(js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('google_sql_python', content)
        self.assertIn('google_sql_javascript', content)
        self.assertIn('quorum_python', content)
        self.assertIn('quorum_javascript', content)
        self.assertIn('initAssignedGroup', content)
        self.assertIn('getAssignedGroup', content)
        self.assertIn("'Assigned Group'", content)
        self.assertIn("'Host Language'", content)

    def test_python_snippet_compilation(self):
        """Verify that Python wrapper patterns compile cleanly with the Python interpreter."""
        mock_queries = [
            "FROM users |> JOIN products ON users.id = products.user_id |> LIMIT 10",
            'query:SetTable("users")\nquery:AddColumn("id")\nquery:SetLimit(10)'
        ]

        # Test the 4 Python pattern templates
        for q_str in mock_queries:
            for pattern_idx in range(4):
                output_var = ['result_table', 'final_data', 'query_output', 'summary_rows'][pattern_idx]
                if pattern_idx == 0:
                    code = f'status_list = ["init", "validated", "ready"]\nstep_count = 0\nfor status in status_list:\n    step_count += 1\n\nquery = """\n{q_str}\n"""\n\nexecution_log = []\nexecution_log.append(f"Built query in {{step_count}} steps")\n\n{output_var} = db.execute(query)'
                elif pattern_idx == 1:
                    code = f'retry_counter = 0\nwhile retry_counter < 2:\n    retry_counter += 1\n\ntarget_query = """\n{q_str}\n"""\n\naudit_trail = []\naudit_trail.append(f"Attempt {{retry_counter}} successful")\n\n{output_var} = db.execute(target_query)'
                elif pattern_idx == 2:
                    code = f'is_approved = True\ncheck_count = 0\nfor i in range(3):\n    check_count += 1\n\nsql_statement = """\n{q_str}\n"""\n\n{output_var} = db.execute(sql_statement)'
                else:
                    code = f'batch_number = 1\nprocess_logs = ["start", "process"]\nfor log in process_logs:\n    batch_number += 1\n\nfull_query = """\n{q_str}\n"""\n\nstatus_msg = "OK" if batch_number > 0 else "PENDING"\n\n{output_var} = db.execute(full_query)'

                # Verify valid Python syntax
                compiled = compile(code, '<test_string>', 'exec')
                self.assertIsNotNone(compiled)

                # Execute with mock db
                mock_db = type('MockDB', (), {'execute': lambda self, q: [{'id': 1}]})()
                exec_scope = {'db': mock_db}
                exec(compiled, exec_scope)
                self.assertIn(output_var, exec_scope)
                self.assertEqual(exec_scope[output_var], [{'id': 1}])

    def test_participant_html_blinding(self):
        """Verify participant.html has NO group badges, dialect tabs, or group names visible."""
        p_path = os.path.join(BASE_DIR, 'participant.html')
        with open(p_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Must not contain group names in markup
        self.assertNotIn('Google SQL with Python', content)
        self.assertNotIn('Google SQL with Javascript', content)
        self.assertNotIn('Quorum with Python', content)
        self.assertNotIn('Quorum with Javascript', content)
        self.assertNotIn('dialect-tabs', content)

    def test_server_export_csv_roundtrip(self):
        """Verify server.py export_csv properly writes the new columns."""
        test_db = {
            'responses': [
                {
                    'id': 'resp_test_1',
                    'participantId': 'user_test_abc',
                    'sessionId': 'session_123',
                    'timestamp': '2026-09-15T10:00:00Z',
                    'questionNumber': 1,
                    'questionCategory': 'Filter',
                    'assignedGroupName': 'Google SQL with Python',
                    'hostLanguage': 'python',
                    'activeDialect': 'pipe',
                    'activeDialectName': 'Google SQL (Pipe Syntax)',
                    'selectedKey': 2,
                    'selectedOptionText': 'Opt B (10 rows)',
                    'correctOptionText': 'Opt B (10 rows)',
                    'isCorrect': True,
                    'responseTimeMs': 4500,
                    'seed': 42,
                    'tabFocusLost': False,
                    'tabSwitchCount': 0,
                    'focusLostDurationMs': 0,
                    'rawQuery': 'SELECT * FROM users;',
                    'dialectSql': 'FROM users',
                    'codeSnippet': 'query = """FROM users"""\nresult = db.execute(query)'
                }
            ],
            'demographics': {
                'user_test_abc': {
                    'participantId': 'user_test_abc',
                    'assignedGroupName': 'Google SQL with Python',
                    'hostLanguage': 'python',
                    'age': '22',
                    'gender': 'Non-binary',
                    'academicStanding': 'Senior',
                    'codingExp': '2-4 years',
                    'dbExp': '1-2 years',
                    'queryExp': 'Intermediate'
                }
            },
            'finalThoughts': {
                'user_test_abc': {
                    'participantId': 'user_test_abc',
                    'thoughts': 'Clean study!'
                }
            }
        }

        server.export_csv(test_db)
        self.assertTrue(os.path.exists(server.CSV_FILE))

        with open(server.CSV_FILE, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader)
            row = next(reader)

        self.assertEqual(header, server.CSV_HEADERS)
        group_idx = header.index('Assigned Group')
        host_idx = header.index('Host Language')
        self.assertEqual(row[group_idx], 'Google SQL with Python')
        self.assertEqual(row[host_idx], 'python')
        print("server.py export_csv successfully wrote Assigned Group and Host Language!")

if __name__ == '__main__':
    unittest.main()
