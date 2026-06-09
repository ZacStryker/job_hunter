-- Clear stored 'resume' prompt override: the old HTML-generation prompt is
-- incompatible with the new JSON pipeline introduced in Epic 42 Story 42.3.
-- Users with a stored override would get the broken HTML prompt until cleared.
DELETE FROM prompts WHERE flow = 'resume';
