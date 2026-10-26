#!/bin/sh
# INPUT: Private ephemeral PGDATA and a Docker network-none boundary.
# OUTPUT: A local Unix-socket-only PostgreSQL process, without extension preloads.
# POS: Recovery image entry. Container restart loses ephemeral data and invalidates its journal.
# [PROTOCOL]: Update this header when making changes, then check README.md.
set -eu
umask 077
initdb --username=postgres --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >/dev/null
exec postgres -c listen_addresses= -c unix_socket_directories=/var/run/postgresql \
  -c shared_preload_libraries= -c session_preload_libraries= -c local_preload_libraries=
