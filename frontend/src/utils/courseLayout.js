import { timeToMinutes } from './timeWindow';

// A differenza dei turni (un blocco per colonna, mai sovrapposti), più corsi possono avere lo
// stesso orario: vanno affiancati in "corsie" (lane) anziché sovrapposti/nascosti l'uno sull'altro.
//
// Algoritmo: si scorrono i corsi ordinati per orario di inizio, assegnando a ciascuno la prima
// corsia libera (nessun corso già assegnato a quella corsia che si sovrappone). I corsi vengono
// poi raggruppati in "cluster" di sovrapposizione transitiva (A si sovrappone a B, B a C => stesso
// cluster anche se A e C non si toccano direttamente): ogni corso occupa 1/laneCount della
// larghezza del proprio cluster, così un cluster con 3 corsi sovrapposti li mostra affiancati in
// 3 colonne, mentre un corso isolato altrove nella giornata occupa tutta la larghezza.
export function layoutCourses(courses) {
  const sorted = [...courses].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
  );

  const laneEndByLane = []; // laneEndByLane[i] = minuto di fine dell'ultimo corso piazzato nella corsia i
  const placed = []; // { course, lane, clusterId }
  let clusterId = -1;
  let clusterEnd = -Infinity; // fine massima raggiunta nel cluster corrente

  for (const course of sorted) {
    const start = timeToMinutes(course.startTime);
    const end = timeToMinutes(course.endTime);

    if (start >= clusterEnd) {
      // Nessuna sovrapposizione con quanto visto finora: nuovo cluster
      clusterId += 1;
      clusterEnd = end;
      laneEndByLane.length = 0;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }

    let lane = laneEndByLane.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEndByLane.length;
      laneEndByLane.push(end);
    } else {
      laneEndByLane[lane] = end;
    }

    placed.push({ course, lane, clusterId });
  }

  const laneCountByCluster = new Map();
  for (const p of placed) {
    laneCountByCluster.set(p.clusterId, Math.max(laneCountByCluster.get(p.clusterId) || 0, p.lane + 1));
  }

  return placed.map((p) => ({
    ...p.course,
    lane: p.lane,
    laneCount: laneCountByCluster.get(p.clusterId),
  }));
}
