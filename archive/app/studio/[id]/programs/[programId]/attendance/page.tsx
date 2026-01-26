import React from 'react'
import { FeatureGate } from '@/components/FeatureGate'

export default function Page() {
	return (
		<FeatureGate flagKey="studio.attendance" mode="page">
			<div>
				<h2 className="text-lg font-medium">Program Aanwezigheden</h2>
				<p className="text-sm text-muted-foreground">Program attendance admin — placeholder page.</p>
			</div>
		</FeatureGate>
	)
}
