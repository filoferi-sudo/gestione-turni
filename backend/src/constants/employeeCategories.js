// Categorie di dipendente (role = 'user'): unica fonte di verità lato backend per la
// validazione. Per aggiungere una nuova categoria (reception, segreteria, personal trainer, ...)
// basta aggiungerla qui e aggiornare il CHECK su users.category in db/schema.sql: nessun'altra
// parte del sistema (routing, permessi, calendario turni) dipende da questo elenco.
const EMPLOYEE_CATEGORIES = ['bagnino', 'istruttore'];

module.exports = { EMPLOYEE_CATEGORIES };
