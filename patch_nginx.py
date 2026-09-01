#!/usr/bin/env python3
import os

NGINX_CONF = "/etc/nginx/sites-available/default"

new_config = """
server {
    root /var/www/html;
    index index.html index.htm participant.html;
    server_name jagger.cx www.jagger.cx; # managed by Certbot

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/jagger.cx/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/jagger.cx/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.jagger.cx) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = jagger.cx) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name jagger.cx www.jagger.cx;
    return 404; # managed by Certbot
}
"""

def main():
    print("Overwriting Nginx configuration with clean setup...")
    os.system(f"cp {NGINX_CONF} {NGINX_CONF}.bak.clean")
    
    with open(NGINX_CONF, 'w') as f:
        f.write(new_config)
        
    print("Testing and reloading Nginx...")
    result = os.system("nginx -t")
    if result == 0:
        os.system("systemctl reload nginx")
        print("Nginx successfully reloaded.")
    else:
        print("Nginx configuration test failed. Restoring backup...")
        os.system(f"cp {NGINX_CONF}.bak.clean {NGINX_CONF}")
        os.system("systemctl reload nginx")

if __name__ == '__main__':
    main()
