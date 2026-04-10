-- One-time cleanup: remove INBOX copies of messages that were moved to subfolders.
-- Safe to re-run (idempotent DELETE).
DELETE FROM messages WHERE uid LIKE 'INBOX:%' AND uid NOT LIKE 'INBOX/%';
