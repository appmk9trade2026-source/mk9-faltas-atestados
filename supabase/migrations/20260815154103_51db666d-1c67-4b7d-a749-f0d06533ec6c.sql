INSERT INTO public.operational_notification_recipients (destination, label, environment, active, verified_at, is_test_recipient) 
VALUES ('+5511999999999', 'Supervisor Técnico Teste', 'SANDBOX', true, now(), true);

SELECT * FROM public.operational_notification_config;
SELECT * FROM public.operational_notification_recipients;