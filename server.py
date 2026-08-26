import http.server
import socketserver
import json
import os
import sys
import csv

PORT = 8000
DB_FILE = "participant_responses_db.json"
CSV_FILE = "participant_responses_export.csv"

class TelemetryHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/load-telemetry':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            data = {"responses": [], "demographics": {}, "finalThoughts": {}}
            if os.path.exists(DB_FILE):
                try:
                    with open(DB_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception as e:
                    print("Error loading DB file:", e)
            
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return
            
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/save-telemetry':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            try:
                payload = json.loads(body.decode('utf-8'))
                db_data = {"responses": [], "demographics": {}, "finalThoughts": {}}
                if os.path.exists(DB_FILE):
                    try:
                        with open(DB_FILE, 'r', encoding='utf-8') as f:
                            db_data = json.load(f)
                    except Exception as e:
                        pass
                
                # Merge incoming responses by unique response ID
                existing_ids = {r.get('id') for r in db_data.get('responses', []) if r.get('id')}
                new_responses = payload.get('responses', [])
                for r in new_responses:
                    if r.get('id') and r.get('id') not in existing_ids:
                        db_data['responses'].append(r)
                        existing_ids.add(r.get('id'))
                
                # Merge demographics
                if payload.get('demographics'):
                    db_data['demographics'].update(payload['demographics'])
                if payload.get('newDemographic'):
                    pid = payload['newDemographic'].get('participantId')
                    if pid:
                        db_data['demographics'][pid] = payload['newDemographic']
                
                # Merge final thoughts
                if payload.get('finalThoughts'):
                    db_data['finalThoughts'].update(payload['finalThoughts'])
                if payload.get('newFinalThought'):
                    pid = payload['newFinalThought'].get('participantId')
                    if pid:
                        db_data['finalThoughts'][pid] = payload['newFinalThought']

                # Save updated DB file to disk
                with open(DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(db_data, f, indent=2)

                # Export CSV file automatically to disk
                export_csv(db_data)

                self.wfile.write(json.dumps({"status": "success", "count": len(db_data['responses'])}).encode('utf-8'))
            except Exception as e:
                print("Error saving telemetry:", e)
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        elif self.path == '/api/clear-telemetry':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            try:
                if os.path.exists(DB_FILE):
                    os.remove(DB_FILE)
                if os.path.exists(CSV_FILE):
                    os.remove(CSV_FILE)
                print("Participant telemetry files deleted by explicit user request.")
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                print("Error clearing telemetry:", e)
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        return super().do_POST()

def export_csv(db_data):
    responses = db_data.get('responses', [])
    demographics = db_data.get('demographics', {})
    final_thoughts = db_data.get('finalThoughts', {})
    
    if not responses:
        return

    fieldnames = [
        'Response_ID', 'Participant_ID', 'Session_ID', 'Timestamp',
        'Question_Category', 'Syntax_Dialect', 'Raw_SQL_Query', 'Dialect_SQL_Query',
        'Selected_Option_Key', 'Selected_Option_Text', 'Correct_Option_Text', 'Is_Correct',
        'Response_Time_MS', 'Focus_Lost', 'Tab_Switch_Count', 'Total_Focus_Lost_Duration_MS',
        'Participant_Age', 'Participant_Gender', 'Academic_Standing', 'Coding_Experience',
        'Database_Experience', 'Query_Writing_Experience', 'Final_Thoughts_Feedback'
    ]

    with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for r in responses:
            pid = r.get('participantId', '')
            demo = demographics.get(pid, {})
            thought_obj = final_thoughts.get(pid, {})
            writer.writerow([
                r.get('id', ''),
                pid,
                r.get('sessionId', ''),
                r.get('timestamp', ''),
                r.get('questionCategory', ''),
                r.get('activeDialectName', r.get('activeDialect', '')),
                r.get('rawQuery', ''),
                r.get('dialectSql', r.get('rawQuery', '')),
                r.get('selectedKey', ''),
                r.get('selectedOptionText', ''),
                r.get('correctOptionText', ''),
                r.get('isCorrect', False),
                r.get('responseTimeMs', 0),
                r.get('tabFocusLost', False),
                r.get('tabSwitchCount', 0),
                r.get('totalFocusLostTimeMs', 0),
                demo.get('age', ''),
                demo.get('gender', ''),
                demo.get('academicStanding', ''),
                demo.get('codingExp', ''),
                demo.get('dbExp', ''),
                demo.get('queryExp', ''),
                thought_obj.get('thoughts', '')
            ])

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, TelemetryHandler)
    print(f"=========================================================")
    print(f"   SQL Test Suite Telemetry Server Started at:")
    print(f"   http://localhost:{port}")
    print(f"   All logs will be saved to disk at:")
    print(f"   - {os.path.abspath(DB_FILE)}")
    print(f"   - {os.path.abspath(CSV_FILE)}")
    print(f"=========================================================", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")
