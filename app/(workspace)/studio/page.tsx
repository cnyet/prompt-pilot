import { StudioWorkspace } from '@/components/studio/StudioWorkspace'
import { findSceneTemplate } from '@/lib/templates'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>
}) {
  const { template } = await searchParams
  const scene = findSceneTemplate(template)

  return <StudioWorkspace initialRequirement={scene?.sample ?? ''} />
}