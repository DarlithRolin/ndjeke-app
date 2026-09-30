// Réglages de l'application — à adapter si une adresse change.
export const CONFIG = {
  farmUrl: 'https://ndjeke2.bloosat.africa',     // serveur farmOS
  clientId: 'gic_app',                            // client OAuth « application » créé dans farmOS
  scope: 'farm_worker',
  nativeRedirect: 'cm.gicndjeke.app://oauth',     // doit être l'URI de redirection du client gic_app
  siteUrl: 'https://ndjeke.rf.gd',                // site public du GIC (ouvert dans le navigateur)
  phone: '+237696164520',
  whatsapp: '237696164520',
  version: '1.0.0',
};
