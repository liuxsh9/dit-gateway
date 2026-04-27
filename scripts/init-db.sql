-- Forgejo uses the default 'forgejo' database (created by POSTGRES_DB env)

-- Create dit database and user for dit-core
CREATE USER dit WITH PASSWORD 'dit';
CREATE DATABASE dit OWNER dit;

-- Connect to dit database and create schema
\c dit
CREATE SCHEMA IF NOT EXISTS dit AUTHORIZATION dit;
