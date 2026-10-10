# Upgrading and backups

Back to the [README](../README.md).

## Backups

```bash
# Unraid (the template names the container "splitbon"; installs from older templates may still use "sharetab")
docker exec splitbon su-exec postgres pg_dump -U sharetab sharetab > backup.sql

# Docker Compose (run from the docker/ directory)
docker compose exec sharetab su-exec postgres pg_dump -U sharetab sharetab > backup.sql
```

These commands use the default database user and name, `sharetab`; if you changed `DB_USER` or `DB_NAME`, use your values here and in the `psql` commands below. The dump covers the database only. A full backup also needs the receipt images (`/app/uploads`), the AI provider logins if you use `meridian` or `openai-codex` (`/app/claude`, `/app/chatgpt`), and your settings. On Unraid the data folders are under `/mnt/user/appdata/splitbon/` (`/mnt/user/appdata/sharetab/` if you installed from an older template) and the template settings are on the flash drive (`/boot/config/plugins/dockerMan/templates-user/`); with Compose the data is in the `docker_uploads`, `docker_claude`, and `docker_chatgpt` named volumes (Compose prefixes volume names with the project name, `docker` by default; `docker volume ls` lists them) and the settings are in `docker/.env` (also keep a copy of `docker/docker-compose.yml` if you edited it, for example to use a prebuilt image).

Files can change between the dump and the copy while people use Splitbon. For a backup where everything matches, stop the container and copy all of its data while it is stopped: on Unraid the whole `/mnt/user/appdata/splitbon/` folder (it includes the database files in `db/`), with Compose the `docker_pgdata`, `docker_uploads`, `docker_claude`, and `docker_chatgpt` volumes. Keep file ownership when you copy (`cp -a` or `rsync -a`), or PostgreSQL can't read its files after a restore.

## Upgrading

Before upgrading:

1. Take a full backup (see [Backups](#backups)).
2. Read the sections below: any upgrade that needs a manual step is described there. The [build releases](https://github.com/cyborcc/splitbon/releases) list every commit since the build you run.
3. Compare `.env.example` with your `.env` (or the Unraid template) for new variables.

Going back to an older build isn't supported once a newer one has changed the database schema: on start, `prisma db push` can refuse to drop the newer columns, and the container won't start. Restore the backup you took before upgrading instead.

The bundled Compose file builds the image from your checkout, so upgrade by updating the checkout and rebuilding. From the `docker/` directory:

```bash
git pull
docker compose up -d --build
```

`docker compose pull` alone doesn't upgrade this setup: the image is built locally, not pulled.

## Prebuilt images

Each push to `main` starts an image build; each build that passes its smoke test is published to the GitHub Container Registry. To run a prebuilt image instead of building one, replace the `build:` block and `image: sharetab:latest` in `docker/docker-compose.yml` with one of these tags, then upgrade from the `docker/` directory with `docker compose pull && docker compose up -d`:

| Tag                               | What it is                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ghcr.io/cyborcc/splitbon:stable` | A build the maintainer has promoted as stable. Recommended; the Unraid template uses this tag. It can lag `main`, so a feature described in this README may not be in it yet.                                                   |
| `ghcr.io/cyborcc/splitbon:latest` | The newest build from `main` that passed its smoke test, whether or not it has been promoted, so it can include changes that haven't been tried outside CI. It can lag the newest commit while a build runs or after one fails. |
| `ghcr.io/cyborcc/splitbon:<sha>`  | One specific commit (short SHA, e.g. `870a80e`), for pinning. A push that lands while the previous build is still running cancels that build, so not every commit has an image.                                                 |

Each push to `main` also gets a GitHub release named `Build YYYY.MM.DD.N-<sha>` listing the changes since the previous build; see [Releases](https://github.com/cyborcc/splitbon/releases). The `stable` git tag normally marks the commit `:stable` was built from ([browse it](https://github.com/cyborcc/splitbon/tree/stable)); after a failed promotion (see [Releases](development.md#releases)) the tag and the image can point at different commits. Splitbon no longer publishes numbered (semver) versions; the last was v0.8.0.

## Database changes on upgrade

The entrypoint automatically runs any SQL migration files in `prisma/migrations/` before applying the Prisma schema, and the files in `prisma/after-push/` after it. Most upgrades are fully automatic.

<a id="email-case-uniqueness"></a>

## Accounts whose emails differ only in letter case

The database rejects a new account whose email matches an existing one ignoring case (`Alice@example.com` and `alice@example.com`). The index that enforces this is created on startup, but it can't be created while such accounts already exist, which older versions allowed. In that case Splitbon starts normally and the container log shows a warning listing the affected addresses:

```
WARNING:  Case-insensitive email uniqueness is not enforced yet: more than one account uses each of these addresses in different letter cases: alice@example.com. ...
```

In the admin dashboard, delete the account the person no longer uses (its expenses stay in their groups under "Deleted user"). The index is created on the next start, or right away with:

```bash
# Unraid
docker exec sharetab su-exec postgres psql -U sharetab -d sharetab \
  -f /app/prisma/after-push/user_email_lower_unique.sql

# Docker Compose (run from the docker/ directory)
docker compose exec sharetab su-exec postgres psql -U sharetab -d sharetab \
  -f /app/prisma/after-push/user_email_lower_unique.sql
```
