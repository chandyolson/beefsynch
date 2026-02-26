
-- Create storage bucket for email assets
INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true);

-- Allow public read access
CREATE POLICY "Email assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');
