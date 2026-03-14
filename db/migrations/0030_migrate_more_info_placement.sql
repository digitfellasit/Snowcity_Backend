-- db/migrations/0030_migrate_more_info_placement.sql
BEGIN;

UPDATE cms_pages 
SET placement = 'more_info', nav_group = NULL
WHERE nav_group = 'more_info';

COMMIT;
