#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${DIT_DB_PASSWORD:?DIT_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v dit_password="$DIT_DB_PASSWORD" <<'SQL'
CREATE USER dit WITH PASSWORD :'dit_password';
CREATE DATABASE dit OWNER dit;
\connect dit
CREATE SCHEMA IF NOT EXISTS dit AUTHORIZATION dit;
SQL
