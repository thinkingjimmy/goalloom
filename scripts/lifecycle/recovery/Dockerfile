# INPUT: An explicitly pinned official Supabase PostgreSQL 17 image supplied by the operator.
# OUTPUT: A volume-free, unprivileged recovery image with no API services or exposed ports.
# POS: Disposable local analysis image; not a backup service or hosted restore target.
# [PROTOCOL]: Update this header when making changes, then check README.md.
ARG POSTGRES_IMAGE
FROM ${POSTGRES_IMAGE} AS postgres
FROM scratch
COPY --from=postgres / /
COPY postgres.sh /usr/local/bin/recovery-postgres
RUN ["/bin/chmod", "0555", "/usr/local/bin/recovery-postgres"]
ENV PATH=/usr/lib/postgresql/17/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV PGDATA=/recovery/data
USER postgres
LABEL com.goalloom.recovery-image="1"
ENTRYPOINT ["/usr/local/bin/recovery-postgres"]
