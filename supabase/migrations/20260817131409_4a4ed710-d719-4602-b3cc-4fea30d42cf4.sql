UPDATE public.operational_notification_config 
SET 
  environment = 'PRODUCTION', 
  kill_switch_enabled = true,
  updated_at = now(),
  updated_by = '212717a0-68b4-46e9-8e9f-21dd21bdc637'
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.operational_notification_audit_logs (actor_id, action, before_state, after_state)
VALUES (
  '212717a0-68b4-46e9-8e9f-21dd21bdc637', 
  'PRODUCTION_P0_GO_LIVE', 
  '{"env": "SANDBOX", "kill": false}', 
  '{"env": "PRODUCTION", "kill": true}'
);