-- Teste grátis padronizado em 15 dias (Augusto, 05/11/2026).
-- Só troca quem ainda está no padrão antigo; valor ajustado à mão no painel fica.
UPDATE config SET valor = '15' WHERE chave = 'trial_dias' AND valor = '14';
