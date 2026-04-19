-- SCRIPT D'IMPORTATION DES MEMBRES : KOUREL SIM (SATA, MET, ILAMEL)
-- À exécuter dans le SQL Editor de Supabase

INSERT INTO members (name, phone, kourel_id, faculty, level, active) 
SELECT name, phone, k.id, faculty, 'L1', true
FROM (VALUES 
    ('Pape Makhtar Aidara', '772476926', 'MET'),
    ('Aliou Amar', '774006848', 'MET'),
    ('Modou Makhtar Aw', '776166438', 'SATA'),
    ('Moustapha Dieng', '765344132', 'MET'),
    ('Mamadou Ngagne Diop', '778495754', 'MET'),
    ('Modou Diop', '787395052', 'SATA'),
    ('Mouhamed Diop', '763507603', 'MET'),
    ('Sonhibou Diop', '772196317', 'MET'),
    ('Assane Diouf', '781681465', 'MET'),
    ('Mor Faye', '779387920', 'MET'),
    ('Serigne Fallou Gaye', '781412862', 'MET'),
    ('MAMADOU MOUSTAPHA KAÏRÉ', '770376473', 'SATA'),
    ('Cheikh Ahmadou MBACKE', '784698359', 'SATA'),
    ('Diouf Mbaye', '772928439', 'SATA'),
    ('Moussa Mbodj', '709576191', 'SATA'),
    ('Fallou Ndiaye', '778221524', 'MET'),
    ('Moussa Samb', '765937304', 'MET'),
    ('Makane Seck', '770639722', 'MET'),
    ('Mamadou TALL', '778294639', 'MET'),
    ('Fallou Thiam', '773459866', 'SATA'),
    ('Maguette THIAM', '708267501', 'SATA'),
    ('Mbaye Tine', '770492872', 'SATA'),
    ('Makhtar WADE', '754469097', 'MET'),
    ('Serigne Fallou Yade', '776948713', 'SATA'),
    ('Matar Gueye', '781501943', 'MET'),
    ('Diaw Amsa', '778460211', 'MET'),
    ('Mass SARY', '784303719', 'SATA'),
    ('Talla Niang', '771062859', 'MET'),
    ('serigne fallou diop', '789618671', 'MET'),
    ('Mbaye Ndiaye', '776468460', 'MET')
) AS t(name, phone, faculty)
CROSS JOIN (
    -- Recherche l'ID du Kourel SIM par son nom
    SELECT id FROM kourels WHERE name LIKE '%SATA-ILAMEL-MET%' LIMIT 1
) AS k;
