#!/usr/bin/env python3
import os
import sys
import re

NGINX_CONF = "/etc/nginx/sites-available/default"

def main():
    if not os.path.exists(NGINX_CONF):
        print(f"File {NGINX_CONF} not found.")
        sys.exit(0)

    with open(NGINX_CONF, 'r') as f:
        content = f.read()

    # Find all "server {" blocks
    server_blocks = [m.start() for m in re.finditer(r'\bserver\s*\{', content)]
    
    if not server_blocks:
        print("No server blocks found.")
        sys.exit(0)

    # For each server block, check if it has location /api/
    # If not, inject it before the first "location / {"
    
    proxy_block = """
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
"""

    new_content = ""
    last_idx = 0
    
    for i, start_idx in enumerate(server_blocks):
        end_idx = server_blocks[i+1] if i + 1 < len(server_blocks) else len(content)
        block = content[start_idx:end_idx]
        
        # Check if this block already has location /api/
        if 'location /api/' not in block:
            # Find location / {
            loc_slash_match = re.search(r'location\s+/\s*\{', block)
            if loc_slash_match:
                insert_pos = loc_slash_match.start()
                block = block[:insert_pos] + proxy_block + block[insert_pos:]
            else:
                # Just append it before the last closing brace (simple heuristic)
                last_brace = block.rfind('}')
                if last_brace != -1:
                    block = block[:last_brace] + proxy_block + block[last_brace:]
                    
        new_content += content[last_idx:start_idx] + block
        last_idx = end_idx
        
    new_content += content[last_idx:]
    
    if new_content != content:
        # Create a backup
        os.system(f"cp {NGINX_CONF} {NGINX_CONF}.bak.patch")
        with open(NGINX_CONF, 'w') as f:
            f.write(new_content)
        print("Nginx configuration patched successfully.")
        os.system("nginx -t && systemctl reload nginx")
    else:
        print("Nginx configuration already contains the necessary proxy blocks.")

if __name__ == '__main__':
    main()
