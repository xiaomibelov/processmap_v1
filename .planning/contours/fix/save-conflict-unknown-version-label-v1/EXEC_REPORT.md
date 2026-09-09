# Execution Report

- Root cause: `Number(null)` and `Number("")` are zero, so the modal's numeric
  guard rendered absent conflict versions as `0`.
- Fix: reject nullish and blank values before numeric conversion.
- RED reproduced the exact `server 0 / client 0` text.
- GREEN: save conflict modal model tests passed 10/10.

