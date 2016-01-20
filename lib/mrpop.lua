for _,queue in ipairs(KEYS) do
  local job = redis.call('rpop', queue)
  if job then return {queue, job} end
end
