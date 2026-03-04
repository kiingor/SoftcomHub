-- Enable Realtime for mensagens table
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;

-- Enable Realtime for tickets table (for ticket updates)
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
