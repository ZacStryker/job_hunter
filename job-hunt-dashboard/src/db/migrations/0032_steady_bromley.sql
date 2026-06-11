ALTER TABLE `profile` ADD `profile_data` text;

UPDATE profile
SET profile_data = (
  SELECT json_object(
    'personal', json_object(
      'fullName',  COALESCE(p.name, ''),
      'email',     COALESCE(p.email, ''),
      'phone',     p.phone,
      'location',  p.location,
      'summary',   p.summary,
      'websites',  (
        SELECT json_group_array(json_object('label', lbl, 'url', url))
        FROM (
          SELECT 'LinkedIn' AS lbl, p.linkedin_url AS url WHERE p.linkedin_url IS NOT NULL
          UNION ALL
          SELECT 'GitHub'   AS lbl, p.github_url   AS url WHERE p.github_url   IS NOT NULL
        )
      )
    ),
    'experience', json_object(
      'jobs',           json_array(),
      'education',      json_array(),
      'projects',       json_array(),
      'certifications', json_array(),
      'licences',       json_array(),
      'awards',         json_array()
    )
  )
  FROM profile p WHERE p.id = profile.id
)
WHERE profile_data IS NULL;
