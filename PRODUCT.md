# Product

## Register

product

## Platform

web

## Users

Piattaforma SaaS multi-azienda per la programmazione di turni e corsi in strutture sportive (piscine, palestre) e, per estensione, altre attività con personale a turni. Gli utenti non sono tecnici: sono persone che ogni giorno pianificano ed eseguono il lavoro, e vivono l'app dentro una gerarchia a ruoli, ognuno con un raggio d'azione preciso.

Quattro ruoli, dal più operativo al più amministrativo:

- **Dipendente** — consulta i propri turni, chiede la cancellazione di un turno, accetta le sostituzioni proposte. Vuole chiarezza su quando e dove lavora, con il minimo attrito.
- **Responsabile** — approva le richieste, copre i turni scoperti, gestisce il personale della propria area. È l'utente che affronta gli imprevisti quotidiani e ha bisogno di risolverli in fretta.
- **Dirigente** — configura la propria società: sedi, aree operative, orari, utenti. Modella l'organizzazione senza toccare il codice.
- **Super Admin** — amministra la piattaforma: crea e gestisce le società clienti. È il ruolo di chi vende e mantiene il software.

L'utente primario di riferimento per le decisioni di design è il **responsabile**, perché è chi passa più tempo dentro il flusso operativo e su cui si misura davvero se lo strumento fa risparmiare tempo o lo fa perdere.

## Product Purpose

Planivo dà alle strutture sportive uno strumento **semplice e specifico** per programmare turni e corsi — non un ERP generico riadattato. Ogni società isola i propri dati, modella liberamente sedi e aree operative, e lavora con un flusso chiaro per ruolo: chi decide gli orari, chi li esegue, chi amministra la piattaforma.

Il successo non è "avere un calendario": è chiudere gli imprevisti da soli. Quando un turno resta scoperto, Planivo lo trasforma in una sostituzione, propone i candidati più adatti con un punteggio spiegato, e aggiorna da sé ore e coperture. Il metro di successo è il tempo che un responsabile *non* spende più al telefono, e la sicurezza di avere sempre il quadro reale del personale e dei costi.

Vincolo di fondo: restare **rivendibile a più aziende dalla stessa piattaforma**, ciascuna capace di configurare la propria struttura senza richiedere interventi sul codice.

## Positioning

Planivo non registra solo i buchi di copertura: li chiude al posto tuo, in modo trasparente. È la singola promessa che ogni schermata deve rinforzare — dallo scoperto alla proposta mirata al turno riassegnato, senza caos e senza telefonate a tappeto.

## Brand Personality

Due registri che convivono: **calma padronanza** e **precisione autorevole**. La voce è quella di uno strumento competente che ha già preso in mano la situazione — rassicurante, mai allarmista, mai chiassoso. Al tempo stesso i numeri contano: coperture, ore e costi sono esatti e verificabili, perché su questi dati si prendono decisioni vere.

Tono in italiano, in lingua piana, pensato per personale non tecnico: si spiega, non si mostra. Ogni automatismo (il ranking dei candidati, il calcolo della copertura) è raccontato in chiaro, mai un responso da scatola nera. L'emozione da lasciare all'utente dopo un imprevisto risolto è *sollievo controllato*: "il software se n'è occupato, e so esattamente cosa ha fatto".

## Anti-references

- **ERP aziendale pesante** (SAP/Oracle e simili): densità opprimente, grigio-su-grigio, decine di campi per schermata, curva d'apprendimento ripida. Il progetto nasce esplicitamente come alternativa a questo.
- **Admin nudo / foglio di calcolo**: l'aspetto di un Excel grezzo o di un dump alla Django-admin — nessuna gerarchia visiva, nessuna cura, funzionale e basta. Lo strumento è specifico e curato, non un backend messo a nudo.

Restano validi i divieti trasversali del sistema di design (niente gradient text, glassmorphism decorativo, hero-metric template, griglie di card identiche, eyebrow maiuscoletti su ogni sezione).

## Design Principles

- **Specifico, non generico.** Ogni scelta serve la programmazione di turni e corsi in una struttura sportiva. Se una funzione esiste "perché gli ERP ce l'hanno", non entra.
- **La calma è una funzionalità.** L'interfaccia assorbe il caos operativo; l'utente deve percepire che il problema è già gestito, non scoprire un nuovo pannello da compilare.
- **Mostra il ragionamento.** Le decisioni del sistema — ranking dei candidati, stato della copertura, ore calcolate — sono trasparenti e spiegate. Mai un numero senza il suo perché.
- **Un compito per schermata.** I flussi sono scoped per ruolo e per area: ogni vista ha un lavoro primario evidente, e non chiede all'utente di indovinare dove agire.
- **Configurabile senza codice.** L'interfaccia si adatta alla struttura di ogni società (sedi, aree, orari), non il contrario. Nessuna azienda deve piegarsi al layout dell'app.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: contrasto sufficiente sul testo di lavoro (≥4.5:1, con attenzione ai grigi tenui su fondi chiari tinti), navigazione completa da tastiera, label esplicite su ogni campo, focus visibile. Interfaccia usata quotidianamente da personale eterogeneo e non tecnico, quindi leggibilità e chiarezza vengono prima dell'eleganza.

Rispetto di `prefers-reduced-motion` su ogni animazione (crossfade o transizione istantanea come alternativa). Lingua primaria italiana.
