#!/usr/bin/env bash
# Build script for Render.com deployment
# Builds both frontend and backend in one step

set -o errexit

echo "=== Installing frontend dependencies ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Installing backend dependencies ==="
cd backend
pip install -r requirements.txt

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput

echo "=== Running migrations ==="
python manage.py migrate --noinput

if [[ -n "$DJANGO_SUPERUSER_USERNAME" && -n "$DJANGO_SUPERUSER_PASSWORD" ]]; then
  echo "=== Ensuring superuser ==="
  python manage.py createsuperuser --noinput || echo "Superuser already exists, skipping"
fi

echo "=== Build complete ==="
