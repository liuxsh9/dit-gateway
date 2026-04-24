-- Forgejo uses the default 'forgejo' database (created by POSTGRES_DB env)

-- Create datahub database and user
CREATE USER datahub WITH PASSWORD 'datahub';
CREATE DATABASE datahub OWNER datahub;

-- Connect to datahub database and create schema
\c datahub
CREATE SCHEMA IF NOT EXISTS datahub AUTHORIZATION datahub;
