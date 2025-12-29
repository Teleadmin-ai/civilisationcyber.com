# Workflow Implementation : Agents R-JEPA & Latents

## Architecture Bicamérale de l'Agent

Chaque "Majordome" est un système à deux cerveaux :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT MAJORDOME                                  │
│                                                                          │
│   ┌─────────────────────┐         ┌─────────────────────┐               │
│   │    LE PARLEUR       │◄───────►│    LE PENSEUR       │               │
│   │    (LLM Student)    │  Δ vec  │    (R-JEPA Teacher) │               │
│   │                     │         │                     │               │
│   │  • Interface humain │         │  • Logique/Stratégie│               │
│   │  • Langage naturel  │         │  • Espace latent    │               │
│   │  • Sémantique       │         │  • Manifold du Vrai │               │
│   └──────────┬──────────┘         └──────────┬──────────┘               │
│              │                               │                          │
│              │         ┌─────────────────────┘                          │
│              │         │                                                │
│              ▼         ▼                                                │
│   ┌─────────────────────────────────────────────────────────┐          │
│   │              MÉMOIRE ASSOCIATIVE                         │          │
│   │                                                          │          │
│   │  • Index local (DuckDB)                                  │          │
│   │  • Traces de succès personnelles                         │          │
│   │  • Contexte cross-session                                │          │
│   │  • Recherche par similarité O(log n)                     │          │
│   └─────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## L'Objet d'Échange : La "Trace"

### Structure JSON

```json
{
  "trace_id": "sha256:a1b2c3d4...",
  "timestamp": 1735593000,

  "context": {
    "embedding": [0.12, -0.34, ..., 0.98],  // z_t (4096-dim)
    "domain": "energy",
    "intent_hash": "sha256:..."
  },

  "action": {
    "code": "ACT_OPTIMIZE_LOAD",
    "parameters_hash": "sha256:...",
    "outcome_embedding": [0.88, 0.04, ..., -0.21]  // z_success
  },

  "validation": {
    "type": "transactional",  // ou "reciprocity", "outcome", "continuation"
    "proof": "zk_snark_proof_base64",
    "validator_did": "did:rjepa:z6Mk...",
    "reputation_at_validation": 450
  },

  "privacy": {
    "pii_check": "passed",
    "reversibility_score": 0.0001  // < 0.001 = irréversible
  }
}
```

### Propriétés Critiques

| Champ | Rôle | Sécurité |
|-------|------|----------|
| `context.embedding` | État initial avant action | Irréversible (4096-dim) |
| `action.outcome_embedding` | État de succès atteint | Irréversible |
| `validation.proof` | Preuve ZK de légitimité | Vérifiable sans révéler |
| `privacy.reversibility_score` | Score de réversibilité | Doit être < 0.001 |

---

## Workflow WRITE : Contribution au Manifold

Quand un agent réussit une action validée :

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. ACTION  │────►│ 2. SUCCÈS   │────►│ 3. ENCODE   │────►│ 4. VALIDATE │
│   Réussie   │     │  Confirmé   │     │   R-JEPA    │     │    ZK       │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                    ┌─────────────┐     ┌─────────────┐            │
                    │ 6. PUBLISH  │◄────│ 5. SANITIZE │◄───────────┘
                    │  Stigmergie │     │    PII      │
                    └─────────────┘     └─────────────┘
```

### Code Python

```python
class WriteWorkflow:
    def __init__(self, llm, rjepa, vector_db, zk_prover):
        self.llm = llm
        self.rjepa = rjepa
        self.db = vector_db
        self.zk = zk_prover

    async def contribute_trace(self, session_log, validation_result):
        # 1. Extraire les hidden states du LLM
        hidden_states = self.llm.get_hidden_states(session_log)

        # 2. Encoder avec R-JEPA (normalisation, stabilisation)
        z_context = self.rjepa.encode(hidden_states['start'])
        z_outcome = self.rjepa.encode(hidden_states['end'])

        # 3. Vérifier irréversibilité (PII check)
        reversibility = self.rjepa.compute_reversibility(z_context)
        if reversibility > 0.001:
            raise PrivacyViolation("Embedding trop réversible")

        # 4. Générer preuve ZK
        proof = self.zk.prove({
            'statement': 'valid_human_with_reputation',
            'public': {'min_reputation': 100},
            'private': {'did': self.did, 'actual_reputation': self.reputation}
        })

        # 5. Construire la Trace
        trace = Trace(
            context_embedding=z_context,
            outcome_embedding=z_outcome,
            action_code=validation_result.action_code,
            validation_proof=proof
        )

        # 6. Publier (stigmergie)
        await self.db.insert(trace)
        await self.broadcast_to_peers(trace.hash)

        return trace
```

---

## Workflow READ : Inférence & Guidage (NUDGE)

Quand un agent doit résoudre un problème nouveau :

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 1. PERCEIVE │────►│ 2. SEARCH   │────►│ 3. PREDICT  │
│   Contexte  │     │  Stigmergie │     │   R-JEPA    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               │ z_pred
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 6. GENERATE │◄────│ 5. NUDGE    │◄────│ 4. COMPUTE  │
│    Texte    │     │   Logits    │     │     Δ       │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Le Cœur : Le Vecteur Δ (Gradient d'Erreur)

```python
class NudgeWorkflow:
    def __init__(self, llm, rjepa, projector, memory):
        self.llm = llm
        self.rjepa = rjepa
        self.projector = projector  # MLP latent → vocab
        self.memory = memory

    def guided_generation(self, user_input, alpha=0.3):
        # 1. Perception : encoder le contexte actuel
        z_current = self.llm.encode_to_latent(user_input)

        # 2. Recherche stigmergique : trouver traces similaires
        similar_traces = self.memory.search(z_current, k=10)

        # 3. Prédiction R-JEPA : où devrait-on aller ?
        z_pred = self.rjepa.predict_next(z_current, similar_traces)

        # 4. Calcul du Δ (gradient d'erreur vectoriel)
        delta = z_pred - z_current

        # 5. Projection dans l'espace vocabulaire
        guidance_bias = self.projector(delta)  # 4096-dim → vocab_size

        # 6. Génération guidée
        logits_llm = self.llm.forward(user_input)
        logits_final = logits_llm + alpha * guidance_bias

        return self.llm.decode(logits_final)
```

### Interprétation Sémantique par le LLM

C'est ici que la magie opère :

```python
def interpret_delta(self, z_current, z_pred, delta):
    """
    Le LLM utilise son pré-training pour comprendre
    la NATURE de l'écart, pas juste sa magnitude.
    """
    # Projeter delta dans l'espace sémantique du LLM
    semantic_direction = self.projector.to_semantic(delta)

    # Le LLM peut maintenant "lire" la correction
    interpretation = self.llm.interpret_vector(semantic_direction)

    # Exemple de sortie :
    # "L'écart indique : trop d'agressivité dans la formulation.
    #  Direction suggérée : vers empathie/collaboration."

    return interpretation
```

---

## Les 3 Modes d'Inférence

### Mode RERANK (Filtre de Vérité)

Le LLM propose plusieurs réponses, R-JEPA choisit la plus "vraie".

```python
def rerank(self, prompt, num_candidates=4):
    # Générer K candidats
    candidates = [self.llm.generate(prompt) for _ in range(num_candidates)]

    z_context = self.rjepa.encode(prompt)

    scores = []
    for response in candidates:
        z_response = self.rjepa.encode(response)
        # Énergie JEPA : plus basse = plus conforme au Manifold
        energy = self.rjepa.compute_energy(z_context, z_response)
        scores.append(energy)

    # Retourner le candidat avec l'énergie minimale
    best_idx = np.argmin(scores)
    return candidates[best_idx], scores[best_idx]
```

### Mode NUDGE (Guidage Token-par-Token)

Déjà décrit ci-dessus. C'est le mode le plus puissant.

### Mode PLAN (Simulation / "Rêve")

R-JEPA prédit les étapes intermédiaires sans générer de texte.

```python
def plan_trajectory(self, start_state, goal_state, max_steps=10):
    """
    Capacité de "rêve" : planifier dans l'espace latent.
    """
    z_start = self.rjepa.encode(start_state)
    z_goal = self.rjepa.encode(goal_state)

    trajectory = [z_start]
    z_current = z_start

    for step in range(max_steps):
        if self.rjepa.distance(z_current, z_goal) < 0.1:
            break

        # Prédire le prochain état latent optimal
        z_next = self.rjepa.predict_step(z_current, z_goal)
        trajectory.append(z_next)
        z_current = z_next

    trajectory.append(z_goal)

    # Convertir la trajectoire latente en étapes textuelles
    steps_text = [self.llm.decode_latent(z) for z in trajectory]

    return trajectory, steps_text
```

---

## Rôle de la Mémoire Associative

La mémoire locale agit comme une **jurisprudence** contextuelle.

```python
class AssociativeMemory:
    def __init__(self, db_path="memory.duckdb"):
        self.db = duckdb.connect(db_path)
        self.index = None  # HNSW index pour recherche O(log n)

    def search(self, z_query, k=10, domain_filter=None):
        """
        Trouve les k traces les plus proches du contexte actuel.
        """
        results = self.index.search(z_query, k=k)

        if domain_filter:
            results = [r for r in results if r.domain == domain_filter]

        return results

    def get_correction_hint(self, z_current, z_rejected):
        """
        Quand R-JEPA rejette une action, trouve le point valide
        le plus proche pour comprendre la correction nécessaire.
        """
        # Chercher le succès validé le plus proche de la position rejetée
        nearest_valid = self.search(z_rejected, k=1)[0]

        # Le delta vers ce point valide est l'indice de correction
        correction_delta = nearest_valid.embedding - z_rejected

        return nearest_valid, correction_delta
```

### Exemple Concret : Négociation

```
Situation: L'utilisateur veut demander une augmentation.

1. LLM génère: "Je vais menacer de partir si je n'ai pas +30%"

2. R-JEPA encode et calcule l'énergie:
   - Energy = 0.89 (HAUTE → hors du Manifold)

3. Mémoire Associative trouve le succès le plus proche:
   - Trace validée: "Présenter ses réalisations + demander feedback"
   - Distance: 0.34

4. Calcul du Δ:
   - Δ pointe de "menace" vers "collaboration"

5. LLM interprète Δ sémantiquement:
   - "L'écart suggère: remplacer confrontation par valorisation"

6. Nouvelle génération (NUDGE appliqué):
   - "Je vais présenter mes réalisations de l'année et ouvrir
      une discussion sur mon évolution salariale"
```

---

## Synchronisation Multi-Agents (Stigmergie)

```
Agent A                    Vector DB                    Agent B
   │                          │                            │
   │  1. Succès validé        │                            │
   │─────────────────────────►│                            │
   │                          │                            │
   │                          │  2. Broadcast hash         │
   │                          │───────────────────────────►│
   │                          │                            │
   │                          │  3. Pull si pertinent      │
   │                          │◄───────────────────────────│
   │                          │                            │
   │                          │  4. Intègre dans           │
   │                          │     son Manifold local     │
   │                          │                            │
```

**Propriété clé** : Les agents ne partagent JAMAIS le texte original, seulement :
- Les embeddings 4096-dim (irréversibles)
- Les preuves ZK (vérifiables sans révéler)
- Les hashes (intégrité)

---

## Résumé : Le GPS Vectoriel

| Composant | Rôle | Analogie GPS |
|-----------|------|--------------|
| **R-JEPA** | Coordonnées du succès | Destination |
| **LLM** | Compréhension du terrain | Carte |
| **Δ (delta)** | Direction de correction | Itinéraire |
| **Mémoire** | Historique contextuel | Trafic en temps réel |
| **Stigmergie** | Intelligence collective | Waze (signalements partagés) |

Le système n'a pas besoin d'apprendre l'échec explicitement. Il mesure la distance vectorielle et le LLM traduit cette distance en correction sémantique.

---

## Prochaines Étapes d'Implémentation

1. **MVP Local** : Un seul agent avec LLM + R-JEPA + Mémoire SQLite
2. **P2P** : Deux agents qui échangent des traces via libp2p
3. **Validation** : Intégration du module ZK (Circom)
4. **Scale** : Déploiement Docker multi-agents avec Vector DB partagée

---

*Document généré pour civilisationcyber.com - Décembre 2025*
