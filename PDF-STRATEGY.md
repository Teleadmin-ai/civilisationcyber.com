# Stratégie PDF Automatisable - civilisationcyber.com

## Situation Actuelle

| Fichier | Rôle | Lignes |
|---------|------|--------|
| `DOC.md` | Documentation technique complète | ~2456 |
| `PARTIE6-IDENTITE-TRACES.md` | Couche Identité (appendu à DOC.md) | ~691 |
| `paper.html` | Papier de recherche académique (HTML → PDF) | ~1600 |
| `index.html` | Site web interactif | ~2700 |
| `assets/docs/presentation-rjepa-cybernetics.pdf` | Slides PDF (12 pages) | N/A |

## Architecture de Génération PDF

```
                              ┌─────────────────────────┐
                              │      paper.html         │
                              │  (Papier Académique)    │
                              │   MathJax + html2pdf    │
                              └───────────┬─────────────┘
                                          │
                                          ▼
                              ┌─────────────────────────┐
                              │   Bouton "Générer PDF"  │
                              │    (Client-side)        │
                              │   html2pdf.bundle.js    │
                              └───────────┬─────────────┘
                                          │
                                          ▼
                              ┌─────────────────────────┐
                              │   rjepa-cybernetics.pdf │
                              │  (Généré à la demande)  │
                              └─────────────────────────┘
```

## Problème Identifié

Le contenu du site (`index.html`) évolue indépendamment de :
- `DOC.md` (documentation Markdown)
- `paper.html` (papier académique)

Risque de **désynchronisation** entre les sources.

## Stratégie Recommandée

### Option 1 : Source Unique (SSOT) - **RECOMMANDÉE**

```
DOC.md (Source de Vérité)
    │
    ├──► index.html (Site Web)
    │       Généré ou synchronisé manuellement
    │
    └──► paper.html (Papier Académique)
            Généré via script de conversion
```

**Avantages** :
- Une seule source à maintenir
- Cohérence garantie

**Implémentation** :
1. **Pandoc** pour conversion `DOC.md → paper.html`
2. Template HTML académique personnalisé
3. Post-processing pour MathJax/CSS

```bash
pandoc DOC.md \
  --from markdown+tex_math_dollars \
  --to html5 \
  --template=templates/paper.html \
  --mathjax \
  --toc \
  -o paper-generated.html
```

### Option 2 : Synchronisation Manuelle (Actuelle)

Maintenir `paper.html` séparément avec mises à jour manuelles quand `DOC.md` change.

**Avantages** :
- Plus de contrôle sur le formatage
- Pas de dépendance à Pandoc

**Inconvénients** :
- Risque de désynchronisation
- Double travail

## Pipeline d'Automatisation GitHub Actions

```yaml
# .github/workflows/generate-pdf.yml
name: Generate PDF

on:
  push:
    paths:
      - 'DOC.md'
      - 'paper.html'
  workflow_dispatch:

jobs:
  build-pdf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Puppeteer
        run: npm install puppeteer

      - name: Generate PDF
        run: |
          node -e "
          const puppeteer = require('puppeteer');
          (async () => {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            await page.goto('file://' + process.cwd() + '/paper.html', {waitUntil: 'networkidle0'});
            await page.pdf({
              path: 'assets/docs/rjepa-cybernetics-paper.pdf',
              format: 'A4',
              margin: { top: '20mm', bottom: '20mm', left: '25mm', right: '25mm' },
              printBackground: true
            });
            await browser.close();
          })();
          "

      - name: Commit PDF
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add assets/docs/rjepa-cybernetics-paper.pdf
          git diff --staged --quiet || git commit -m "chore: Auto-generate PDF from paper.html"
          git push
```

## Script Local (Windows)

```powershell
# generate-pdf.ps1
# Génère le PDF localement avec html2pdf-cli

# Option 1: Via Node.js (Puppeteer)
npx puppeteer-pdf paper.html -o assets/docs/rjepa-cybernetics-paper.pdf

# Option 2: Via Python (WeasyPrint)
# pip install weasyprint
# python -c "import weasyprint; weasyprint.HTML('paper.html').write_pdf('assets/docs/rjepa-cybernetics-paper.pdf')"
```

## Checklist de Synchronisation

Quand vous modifiez le contenu R-JEPA, mettez à jour :

- [ ] `DOC.md` - Documentation technique
- [ ] `PARTIE6-IDENTITE-TRACES.md` - Si identité modifiée
- [ ] `paper.html` - Papier académique (ajouter la section correspondante)
- [ ] `index.html` - Site web (section visuelle)
- [ ] `CLAUDE.md` - Instructions Claude (si nouvelle section)

## Sections Actuelles (paper.html)

| # | Section | Statut |
|---|---------|--------|
| 1 | Introduction | ✅ |
| 2 | Fondements Théoriques | ✅ |
| 3 | Architecture R-JEPA | ✅ |
| 4 | Formalisme Mathématique | ✅ |
| 5 | Symbiose Humain-Majordome | ✅ |
| 6 | Invariance d'Échelle (VSM) | ✅ |
| 7 | Contrat Social Cybernétique | ✅ |
| 8 | Cybersyn (1971-1973) | ✅ |
| 9 | Implémentation | ✅ |
| **10** | **Couche Identité & Économie des Traces** | ✅ **NOUVEAU** |
| 11 | Conclusion | ✅ |
| 12 | Références | ✅ |
| A | Annexe Technique | ✅ |

## Prochaines Étapes

1. **Court terme** : Commit paper.html avec Section 10
2. **Moyen terme** : Créer GitHub Action pour PDF auto
3. **Long terme** : Migrer vers SSOT avec Pandoc + templates

---

*Dernière mise à jour : 2025-12-29*
