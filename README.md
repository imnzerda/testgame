# Merge Around the World

Merge game casual jouable dans le navigateur (desktop + mobile web). Cahier des charges : `merge-around-the-world-spec.md`.

**État : Phase 1 — prototype jouable (local)** terminée, en attente de validation.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173  (jeu sur /play)
npm test             # tests unitaires (Vitest) : moteur + contenu
npm run test:e2e     # tests E2E (Playwright, desktop + mobile)
npm run typecheck    # TypeScript strict + svelte-check
npm run build        # build de production (adapter-node)
```

Première fois pour l'E2E : `npx playwright install chromium`.

## Structure

```
packages/engine    Moteur du plateau en TypeScript pur, sans dépendance au rendu.
                   Réducteur pur applyAction(state, action, ctx) -> { state, events }.
                   Déterministe (RNG à graine stockée dans l'état) : le serveur de la
                   phase 2 rejouera exactement les mêmes actions.
packages/content   Toutes les données en JSON : chaînes, générateurs, chapitres,
                   équilibrage (balance.json), visuels (emoji, couleurs, formes).
apps/web           SvelteKit (UI, i18n, SSR de la page vitrine) + PixiJS v8 (plateau).
e2e                Tests Playwright.
```

Règles respectées :
- aucune logique économique dans l'UI : chaque changement d'état passe par `applyAction` ;
- aucune valeur d'équilibrage en dur : tout est dans `packages/content/data` ;
- les tests du moteur ont été écrits avant le branchement du rendu.

## Phase 1 — contenu livré

- Plateau 7×9, cases bloquées (toiles : fusion dessus ou à côté ; cartons : fusion à côté).
- Glisser-déposer (fusion / déplacement / échange) **et** mode tap-tap.
- Fusion de 5, auto-merge déterministe (moteur + bouton, débloqué niveau 10, 3/jour),
  protection des objets demandés par les commandes, verrouillage par appui long.
- Générateur fusionnable (4 niveaux), probabilités affichées, charges / recharge gérées par le moteur.
- Énergie calculée par horodatage (100 max, +1 toutes les 2 min).
- 3 commandes adaptées à ce que le joueur peut produire, XP, niveaux (recharge d'énergie).
- Vente via la zone de recyclage, rénovation de Paris en 7 tâches, fin de chapitre.
- FR / EN, formes distinctes par chaîne (daltonisme), animations réduites, cases ≥ 48 px sur tactile.
- Événements analytics mis en tampon localement (envoi serveur en phase 2).
- Sauvegarde locale (localStorage).

## Écarts / décisions à valider

- **Fusion de 5** : le cahier des charges dit « 2 objets au lieu de 2,5 », mais 5 → 2 ferait
  *moins* bien que des paires (4 → 2 + 1 restant). Implémenté en **5 → 3** (configurable dans
  `balance.json`) ; si on règle 5 → 2, le moteur ne la propose jamais car elle n'est pas avantageuse.
- L'auto-merge ne fusionne **pas les générateurs** (choix laissé au joueur).
- Annuler, inventaire, indice, tri, bulles et auto-tap sont prévus en phase 2 (comme dans le plan).
