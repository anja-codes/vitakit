# Built-in sections

Five sections need no schema: create the file and it works. Their types are
described in [field types](./field-types.md); **formatted text** accepts
Markdown and `$math$`. Every entry also accepts `visibility` (see [the content
folder](./index.md#visibility)).

To add a field to one of them, `vitakit add field` (see [schemas](./schemas.md)).

## `content/education.yml`

| Field               | Type         | Required |
| ------------------- | ------------ | -------- |
| `date`              | date         | yes      |
| `degree`            | text         | yes      |
| `institution`       | link         | yes      |
| `thesis.title`      | formatted text     | —        |
| `thesis.type`       | text         | no       |
| `thesis.supervisor` | link         | no       |
| `thesis.url`        | web address | no       |
| `note`              | text         | no       |

```yaml
- date: { from: 2016, to: 2020 }
  degree: PhD in Mathematics
  institution: { name: University of Klagenfurt, url: https://www.aau.at }
  thesis:
    title: Cutting down random trees
    type: Doctoral thesis
    supervisor: { label: A. Supervisor, url: https://example.org/s }
```

## `content/employment.yml`

| Field                                            | Type              | Required |
| ------------------------------------------------ | ----------------- | -------- |
| `date`                                           | date              | yes      |
| `position`                                       | text              | yes      |
| `institution`                                    | link              | yes      |
| `project.title`                                  | formatted text          | —        |
| `project.funder`, `project.grant`, `project.url` | text, text, web address | no       |
| `note`                                           | text              | no       |

## `content/teaching.yml`

| Field         | Type        | Required | Notes                                                |
| ------------- | ----------- | -------- | ---------------------------------------------------- |
| `date`        | date        | yes      |                                                      |
| `title`       | formatted text    | yes      |                                                      |
| `role`        | text        | no       | `Lecturer`, `Teaching Assistant`, …                  |
| `institution` | link        | no       |                                                      |
| `term`        | text        | no       | `2024W`, `Winter 2023/24`; shown instead of the date |
| `url`         | web address | no       |                                                      |
| `note`        | text        | no       |                                                      |

## `content/talks.yml`

| Field           | Type     | Required | Notes                                                     |
| --------------- | -------- | -------- | --------------------------------------------------------- |
| `date`          | date     | yes      |                                                           |
| `title`         | formatted text | yes      |                                                           |
| `event`         | text     | no       |                                                           |
| `location`      | text     | no       |                                                           |
| `kind`          | enum     | no       | `invited`, `contributed`, `seminar`, `poster`, `outreach` |
| `url`, `slides` | web address | no       |                                                           |

`kind` is what document selection uses: `where: { kind: invited }`. See
[selection options](../pdf/index.md#selection-options).

## `content/supervision.yml`

| Field          | Type        | Required | Notes |
| -------------- | ----------- | -------- | ----- |
| `date`         | date        | yes      |
| `student`      | text        | yes      |
| `title`        | formatted text    | yes      |
| `ongoing`      | boolean     | no       | `true` for a thesis still in progress; defaults to `false` |
| `degree`       | text        | no       |
| `institution`  | link        | no       |
| `coSupervisor` | text        | no       |
