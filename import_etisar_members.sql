-- SCRIPT D'IMPORTATION DES MEMBRES : KOUREL ETISAR
-- À exécuter dans le SQL Editor de Supabase

INSERT INTO members (name, phone, kourel_id, faculty, level, active) 
SELECT name, phone, k.id, faculty, level, active
FROM (VALUES 
    ('Cheikh ahmadou bamba gueye', '+221 77 649 55 09', 'ETISAR', 'L1', true),
    ('Mouhamadou Moustapha Kaire', '+221 76 791 92 06', 'ETISAR', 'L1', true),
    ('Baara diop', '+221 78 464 81 99', 'ETISAR', 'L1', true),
    ('Adama mboodji', '+221 78 333 71 39', 'ETISAR', 'L1', true),
    ('Seydina Mouhamed seck', '+221 70 543 10 13', 'ETISAR', 'L1', true),
    ('Cheikh daikhaté', '+221 78 444 85 86', 'ETISAR', 'L1', true),
    ('Mame Thierno ndiaye', '+221 78 011 40 88', 'ETISAR', 'L1', true),
    ('aliou thiaw', '+221 77 800 42 10', 'ETISAR', 'L1', true),
    ('ousseynou samb', '+221 78 503 30 68', 'ETISAR', 'L1', true),
    ('Samba kane', '+221 78 719 26 08', 'ETISAR', 'L1', true),
    ('Serigne Mouhamed khabane diop', '+221 77 839 57 83', 'ETISAR', 'L1', true),
    ('Akhma ndiaye', '+221 77 669 02 76', 'ETISAR', 'L1', true),
    ('Moukhtar diop', '+221 78 404 19 99', 'ETISAR', 'L1', true),
    ('Fallou faye', '+221 76 885 82 32', 'ETISAR', 'L1', true),
    ('Saliou mbaye', '+221 77 938 45 48', 'ETISAR', 'L1', true),
    ('Fallou Diouf', '+221 76 319 72 88', 'ETISAR', 'L1', true),
    ('Moukhtar niang', '+221 76 475 49 82', 'ETISAR', 'L1', true),
    ('Serigne saliou sylla', '+221 76 137 84 47', 'ETISAR', 'L1', true),
    ('Mballo diop', '+221 76 924 00 34', 'ETISAR', 'L1', true),
    ('Adama wade', '+221 77 164 22 75', 'ETISAR', 'L1', true),
    ('Baye mor mboup', '+221 78 515 30 47', 'ETISAR', 'L1', true),
    ('Serigne massamba', '+221 76 882 01 82', 'ETISAR', 'L1', true)
) AS t(name, phone, faculty, level, active)
CROSS JOIN (
    -- Recherche l'ID du Kourel ETISAR par son nom
    SELECT id FROM kourels WHERE name LIKE '%ETISAR%' LIMIT 1
) AS k;
