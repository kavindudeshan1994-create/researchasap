# ResearchASAP

A responsive, free-to-run scientific literature dashboard for tracking newly published papers from selected journals.

## Features

- Choose journals across chemistry, chemical biology, biochemistry, cell biology, materials, and general science.
- Retrieve recent papers using the public [OpenAlex API](https://docs.openalex.org/).
- Search the currently loaded papers by title, authors, journal, or abstract.
- Read abstract-derived previews and full abstracts (when available), and follow DOI/publisher links.
- Save papers in your browser using localStorage.
- Browse paginated results and refresh manually.
- Mobile-friendly layout.

## Run locally

Open `index.html` in a modern browser. If your browser restricts local-file requests, serve the folder using:

```sh
python -m http.server 8000
```

Then visit http://localhost:8000.

## Publish free using GitHub Pages

In the GitHub repository, open **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, choose **main** and **/(root)**, then **Save**. Wait for GitHub to show the public site URL. This step is not performed automatically by the code commit.

Expected Pages URL after activation: https://kavindudeshan1994-create.github.io/researchasap/

## Limitations and roadmap

- This is a **static MVP**, not a backend-based service. It requires internet access and uses OpenAlex from the browser; its public API limits and coverage apply.
- The preview is **abstract-derived**, **not an AI-generated summary**. Objective/method/results/significance extraction needs a separate summarization implementation.
- Publisher graphical abstracts are **not yet implemented**: OpenAlex does not provide a reliable standardized publisher graphical-abstract field. Image retrieval must respect publisher rights and technical restrictions.
- Search applies to the **currently loaded page** of results, not the entire literature corpus.
- Journal-name matching depends on OpenAlex's source records. Unmatched journal names are skipped.
- Bookmarks and journal selections are stored only in the current browser, not synced across devices.
- Automatic background refresh, full-text search, account sync, and backend infrastructure are future work.

This project is independent of OpenAlex and of the publishers whose metadata it displays.
