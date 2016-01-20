redis.call('zrem', KEYS[1], ARGV[1])
redis.call('lpush', KEYS[2], ARGV[1])
