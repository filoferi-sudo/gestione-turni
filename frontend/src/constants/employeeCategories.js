// Categorie di dipendente disponibili e relativa etichetta in italiano. Unica fonte di verità
// lato frontend: usata sia dal form di creazione utente sia dal registro dashboard-per-categoria
// (vedi pages/employee/EmployeeDashboardRouter.jsx). Per aggiungere una nuova categoria
// (reception, segreteria, personal trainer, ...) basta aggiungerla qui, allineare il CHECK su
// users.category nel backend, e registrare la relativa dashboard nel router.
export const EMPLOYEE_CATEGORIES = [
  { value: 'bagnino', label: 'Bagnino' },
  { value: 'istruttore', label: 'Istruttore' },
];

export const EMPLOYEE_CATEGORY_LABELS = Object.fromEntries(
  EMPLOYEE_CATEGORIES.map((c) => [c.value, c.label])
);
