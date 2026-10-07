# Copiá a $HARNESS_DIR/env-e2e.sh. Bases desechables en loopback (los nombres
# tienen que contener "test"); los secretos se generan, nunca se reutilizan.
export DATABASE_URL=mysql://root:root@127.0.0.1:33068/ecom_e2e_test
export TEST_DATABASE_URL=mysql://root:root@127.0.0.1:33068/ecom_e2e_test
export SESSION_SECRET=$(openssl rand -hex 32)
export NEXT_PUBLIC_SITE_URL=https://ci.example.py
export CRON_SECRET=$(openssl rand -hex 24)
export WHATSAPP_NUMBER=595981000000
export OWNER_EMAIL=owner@ci.example.py
export OWNER_PASSWORD=$(openssl rand -base64 18)Aa1!
export OWNER_NAME="Dueña de prueba"
export CLOUDINARY_CLOUD_NAME=disposable-gallery-fixture
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
export E2E_PORT=3100
