v0.2.0
- add `.createMultiWorker(...)`
- remove optional callback from `worker.close()` & `scheduler.close()`
- remove `hardcore` option; uncaught exceptions will always crash the worker
- test all the things
- drop fakeredis b/c Lua
- bug squashing
