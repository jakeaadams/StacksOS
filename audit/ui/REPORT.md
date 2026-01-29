# StacksOS UI Audit

Generated: 2026-01-27T01:43:52Z

Policy: no dead UI (no placeholder links, no no-op handlers).

## Summary

check          count
href_hash      0
onclick_noop   0
onsubmit_noop  0
coming_soon    0

## Details

### external_evergreen_site.txt

```
/home/jake/projects/stacksos/src/app/staff/cataloging/z3950/page.tsx:373:            docsUrl="https://docs.evergreen-ils.org/eg/docs/latest/cataloging/z3950.html"
/home/jake/projects/stacksos/src/app/staff/acquisitions/receiving/page.tsx:558:            docsUrl="https://docs.evergreen-ils.org/eg/docs/latest/acquisitions.html"
```

