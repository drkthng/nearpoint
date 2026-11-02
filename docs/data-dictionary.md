# Data dictionary (CSV export)

The export produces one CSV file per table. Format: UTF-8 without BOM, RFC 4180 quoting, CRLF line
endings, one header row. An empty field means null/not recorded. Booleans are `1` (true) and `0` (false).
List-valued columns are `;`-separated. Times are ISO 8601 UTC strings exactly as stored. Contrast is
Michelson contrast in linear luminance (0 to 1). Units are given per column.
Empty string and null are not distinguished in CSV (both export as an empty field); NaN and Infinity
export as empty; numbers below 1e-6 may appear in exponent form (for example `3e-7`).

The JSON backup (not the CSV) is the restore format; CSV is for analysis only and cannot be imported back.

Timing columns: a trial of N frames has N+1 requestAnimationFrame timestamps (ms, `DOMHighResTimeStamp`
clock), so frame k lasts `timestamps[k+1] - timestamps[k]`. A trial is invalid if any frame interval is
greater than 1.5x the nominal interval (1000 / `timing_hz` ms) or timestamps do not increase; invalid
trials do not update the staircase. `timing_segments` is the intended frame sequence run-length encoded as
`phase:interval:frames:flags` segments joined by `;`. Phase is one of fixation, blank, stim, isi, mask,
gap; interval is 0 (outside the observation intervals), 1 or 2; flags is the concatenation of `T` (target
shown), `F` (flankers shown), `X` (fixation shown) in that order, empty if none. Example:
`fixation:0:12:X;blank:0:23:;stim:1:4:TF`.

## Backup and restore

The JSON backup is the restore format. Restore replaces all data atomically: if anything fails, the
existing data is left unchanged. A backup from a newer schema than the app is refused; backups from
older schemas are restored as-is (future migrations must transform them). The browser can evict site
data, so call `requestPersistence()` at first run and export backups regularly.

## calibrations.csv

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `id` | integer | | Primary key. |
| `created_at` | string | ISO 8601 UTC | When the calibration was saved. |
| `px_per_mm` | number | px/mm | Physical pixel density of the screen from calibration. |
| `distance_cm` | number | cm | Viewing distance assumed for this calibration. |
| `hz_measured` | number | Hz | Refresh rate measured from rAF timestamps. |
| `hz` | number | Hz | Measured rate snapped to the nominal rate used for frame counts. |
| `device_pixel_ratio` | number | | window.devicePixelRatio at calibration. |
| `screen_width_px` | integer | px | Screen width in device pixels. |
| `screen_height_px` | integer | px | Screen height in device pixels. |
| `method` | string | | Calibration method: card, ruler or manual. |
| `user_agent` | string | | Browser user agent string. |
| `note` | string | | Free-text note, may be empty. |

## sessions.csv

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `id` | integer | | Primary key. |
| `started_at` | string | ISO 8601 UTC | Session start. |
| `ended_at` | string | ISO 8601 UTC | Session end; empty while in progress. |
| `status` | string | | in-progress, completed or aborted. |
| `session_index` | integer | | Running index of the session in the training program. |
| `calibration_id` | integer | | Foreign key to calibrations.id; empty if none. |
| `curriculum_version` | integer | | Version of the curriculum data used. |
| `cpd` | number | cycles/degree | Gabor spatial frequency for this session. |
| `theta_deg` | number | degrees | Gabor orientation for this session. |
| `change` | string | | What the curriculum changed relative to the previous session. |
| `reason` | string | | Human-readable reason for the change. |

## blocks.csv

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `id` | integer | | Primary key. |
| `session_id` | integer | | Foreign key to sessions.id. |
| `block_index` | integer | | Position of the block within the session, from 0. |
| `condition` | string | | Stimulus condition, for example LM, BM-CROWD. |
| `cpd` | number | cycles/degree | Gabor spatial frequency. |
| `theta_deg` | number | degrees | Gabor orientation. |
| `dur_ms` | number | ms | Target (and mask) duration. |
| `trials_planned` | integer | | Number of trials planned for the block. |
| `flank_contrast` | number | Michelson contrast | Flanker contrast; empty if the condition has no flankers. |
| `n_flankers` | integer | | Number of flankers; empty if not applicable. |
| `sep_lambda` | list of numbers | wavelengths | Target-flanker separations used in the block. |
| `isi_ms` | list of numbers | ms | Inter-stimulus intervals used in the block. |
| `threshold` | number | Michelson contrast | Estimated contrast threshold; empty if not estimated. |
| `reversals` | list of numbers | Michelson contrast | Staircase reversal contrasts. |
| `valid_trials` | integer | | Trials with valid timing. |
| `invalid_trials` | integer | | Trials flagged invalid by timing. |

## trials.csv

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `id` | integer | | Primary key. |
| `session_id` | integer | | Foreign key to sessions.id. |
| `block_id` | integer | | Foreign key to blocks.id. |
| `trial_index` | integer | | Position of the trial within the block, from 0. |
| `at` | string | ISO 8601 UTC | When the trial was run. |
| `contrast` | number | Michelson contrast | Target contrast presented. |
| `sep_lambda` | number | wavelengths | Target-flanker separation; empty if no flankers. |
| `isi_ms` | number | ms | Inter-stimulus interval; empty if not applicable. |
| `target_interval` | integer | | Interval (1 or 2) that contained the target. |
| `response` | integer | | Interval chosen by the observer (1 or 2); empty if none. |
| `correct` | boolean | | 1 if the response matched target_interval; empty if no response. |
| `rt_ms` | number | ms | Response time; empty if no response. |
| `valid` | boolean | | 1 if the timing was valid and the trial counted. |
| `timing_hz` | number | Hz | Refresh rate used for the frame counts. |
| `timing_frames` | integer | frames | Number of frames in the trial (timestamps minus one). |
| `timing_valid` | boolean | | 1 if no timing problem was found. |
| `timing_max_interval_ms` | number | ms | Longest observed frame interval. |
| `timing_late_frames` | list of integers | frame index | Frames k whose interval exceeded 1.5x nominal. |
| `timing_reasons` | string | | Reasons for invalid timing, joined with ` \| `. |
| `timing_segments` | string | | Intended frame sequence, run-length encoded (see above). |
| `timing_timestamps` | list of numbers | ms | Observed rAF timestamps, full precision; N frames give N+1 values. |

## outcome_tests.csv

| Column | Type | Unit | Description |
| --- | --- | --- | --- |
| `id` | integer | | Primary key. |
| `created_at` | string | ISO 8601 UTC | When the test was run. |
| `kind` | string | | Outcome test identifier. |
| `calibration_id` | integer | | Foreign key to calibrations.id; empty if none. |
| `summary` | JSON | | Object of summary values (numbers, strings or null). |
| `details` | JSON | | Test-specific details; empty if none. |
