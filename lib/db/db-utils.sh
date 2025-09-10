#!/bin/bash
# Database utility script that ensures we always connect to the correct database

# Load environment variables from .env.local
if [ -f .env.local ]; then
    export $(grep -E '^DATABASE_URL=' .env.local | xargs)
elif [ -f ../.env.local ]; then
    export $(grep -E '^DATABASE_URL=' ../.env.local | xargs)
else
    echo "Error: .env.local not found"
    exit 1
fi

# Execute psql with the correct DATABASE_URL
psql "$DATABASE_URL" "$@"
