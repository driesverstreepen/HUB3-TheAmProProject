'use client'

import ProgramDetailModal from '@/components/ProgramDetailModal'

type Props = {
  isOpen: boolean
  onClose: () => void
  programId: string
}

export default function UserProgramDetailModal(props: Props) {
  return <ProgramDetailModal {...props} view="user" />
}
