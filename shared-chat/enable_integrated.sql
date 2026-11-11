-- Run only after staging and multi-device checks. Environment gate must also be enabled.
update shared_chat_private.settings set enabled=true, integrated_enabled=true where id=true;
