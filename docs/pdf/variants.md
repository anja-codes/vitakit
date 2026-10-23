# Variants and prose

## A variant for one application

A document is a file, so make one by copying a file:

```bash
cp cv-tex/cv.tex cv-tex/teaching-uni-x.tex
cp cv-tex/cv.yml cv-tex/teaching-uni-x.yml      # optional
```

Change `\vitadocument{cv}` to `\vitadocument{teaching-uni-x}` in the copy, reorder the
`\vitasection` lines, adjust the YAML, then `vitakit pdf teaching-uni-x`.

**The data is untouched**, so your website and every other variant are unaffected.
If an older document uses `\input{generated/cv/profile.tex}`, replace that line
with `\vitainput{profile}` first, so the copy reads its own generated profile.

## A prescribed order

Calls often prescribe exactly what a dossier must contain. That is purely a matter of
the `.tex`:

```tex
\begin{document}
\input{prose/application-xyz-cover.tex}   % 1. cover letter
\newpage
\tableofcontents                          % 2. table of contents
\newpage
\vitapublications[Publications]{all}      % 3. publications
\input{prose/research-statement.tex}      % 4. research statement
\vitasection[Courses taught]{teaching}    % 5. courses taught
\vitasection{supervision}                 % 6. supervised theses
\input{prose/teaching-statement.tex}      % 7. teaching statement
\end{document}
```

The optional argument sets the prescribed wording directly in the document.
Use `\vitasectiontitle` in the preamble for labels shared across documents.

## Prose

Cover letters and statements live in `cv-tex/prose/*.tex` as plain LaTeX, and are
never read by the website build. Include them with `\input` wherever you want them.

A section added with `vitakit add section <name> --document <name>` goes into
any document, after the section you choose.
